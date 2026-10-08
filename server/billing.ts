import crypto from "node:crypto";
import express, { type Request, type Response, type Router } from "express";
import type Stripe from "stripe";
import { z } from "zod";
import { PLANS, getPlan } from "../src/domain/plans";
import type { PlanId } from "../src/domain/types";
import type { Db } from "./db";
import { requireUser } from "./auth";
import { loadProject, planOf } from "./projects";

/** The parts of the Stripe SDK we use, so tests can pass a fake. */
export interface StripeLike {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<{ id: string; url: string | null }>;
      retrieve(id: string): Promise<Stripe.Checkout.Session>;
    };
  };
  webhooks: { constructEvent(payload: Buffer, header: string, secret: string): Stripe.Event };
}

export interface BillingConfig {
  stripe: StripeLike | null;
  webhookSecret: string;
  publicUrl: string | null;
  /** Grant plans without payment. Only for local development and tests. */
  demoCheckout: boolean;
  now: () => Date;
}

export type PaymentsMode = "stripe" | "demo" | "off";
export const paymentsMode = (c: BillingConfig): PaymentsMode => (c.stripe ? "stripe" : c.demoCheckout ? "demo" : "off");

function recordPurchase(db: Db, p: { projectId: string; userId: string; plan: PlanId; cents: number; provider: string; ref: string; now: Date }) {
  const id = `pur_${crypto.randomBytes(8).toString("hex")}`;
  // provider_ref is UNIQUE, so a replayed webhook or a double confirm can't double-grant.
  db.prepare(
    "INSERT OR IGNORE INTO purchases (id, project_id, user_id, plan, amount_cents, provider, provider_ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, p.projectId, p.userId, p.plan, p.cents, p.provider, p.ref, p.now.toISOString());
}

function fulfill(db: Db, session: Stripe.Checkout.Session, now: Date): { projectId: string } | null {
  const { projectId, userId, plan } = session.metadata ?? {};
  if (session.payment_status !== "paid" || !projectId || !userId || !getPlan(plan as PlanId)) return null;
  const owner = db.prepare("SELECT 1 FROM projects WHERE id = ? AND user_id = ?").get(projectId, userId);
  if (!owner) return null;
  recordPurchase(db, { projectId, userId, plan: plan as PlanId, cents: session.amount_total ?? 0, provider: "stripe", ref: session.id, now });
  return { projectId };
}

export function webhookRoute(db: Db, cfg: BillingConfig): express.RequestHandler {
  return (req: Request, res: Response) => {
    if (!cfg.stripe || !cfg.webhookSecret) return res.status(503).json({ error: "Payments aren't configured." });
    let event: Stripe.Event;
    try {
      event = cfg.stripe.webhooks.constructEvent(req.body as Buffer, String(req.headers["stripe-signature"] ?? ""), cfg.webhookSecret);
    } catch {
      return res.status(400).json({ error: "Bad signature." });
    }
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      fulfill(db, event.data.object as Stripe.Checkout.Session, cfg.now());
    }
    res.json({ received: true });
  };
}

const CheckoutBody = z.object({ plan: z.enum(["basic", "plus", "pro"]) });

export function billingRoutes(db: Db, cfg: BillingConfig): Router {
  const r = express.Router();

  r.get("/config", (_req, res) => {
    res.json({ payments: paymentsMode(cfg) });
  });

  r.post("/projects/:id/checkout", requireUser, async (req, res) => {
    const body = CheckoutBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Choose a plan." });
    const project = loadProject(db, req.user!.id, pid(req));
    if (!project) return res.status(404).json({ error: "Project not found." });

    const target = getPlan(body.data.plan)!;
    const current = getPlan(planOf(db, pid(req)));
    const quoteCount = Array.isArray(project.quotes) ? project.quotes.length : 0;
    if (current && target.price <= current.price) return res.status(409).json({ error: `You already have the ${current.name} plan.` });
    if (quoteCount > target.maxQuotes) {
      return res.status(409).json({ error: `${target.name} covers up to ${target.maxQuotes} quotes and this project has ${quoteCount}. Pick a bigger plan or remove a quote.` });
    }
    const due = target.price - (current?.price ?? 0);
    const mode = paymentsMode(cfg);

    if (mode === "off") return res.status(503).json({ error: "Payments aren't available right now.", code: "payments_off" });
    if (mode === "demo") {
      recordPurchase(db, { projectId: pid(req), userId: req.user!.id, plan: target.id, cents: due * 100, provider: "demo", ref: `demo_${crypto.randomUUID()}`, now: cfg.now() });
      return res.json({ demo: true, plan: planOf(db, pid(req)) });
    }

    const base = cfg.publicUrl ?? `${req.protocol}://${req.get("host")}`;
    try {
      const session = await cfg.stripe!.checkout.sessions.create({
        mode: "payment",
        customer_email: req.user!.email,
        client_reference_id: pid(req),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: due * 100,
              product_data: { name: `Estimate Check ${target.name}${current ? ` (upgrade from ${current.name})` : ""}`, description: `Up to ${target.maxQuotes} quotes, one project` },
            },
          },
        ],
        metadata: { projectId: pid(req), userId: req.user!.id, plan: target.id },
        success_url: `${base}/#/p/${pid(req)}/results?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/#/p/${pid(req)}/results`,
      });
      if (!session.url) throw new Error("no checkout url");
      res.json({ url: session.url });
    } catch (err) {
      console.error("stripe checkout failed", err);
      res.status(502).json({ error: "We couldn't start the payment. Nothing was charged. Try again in a minute." });
    }
  });

  /** After Stripe sends the buyer back, confirm the payment directly so we don't depend on webhook timing. */
  r.post("/billing/confirm", requireUser, async (req, res) => {
    const sessionId = z.object({ sessionId: z.string().min(5).max(200) }).safeParse(req.body);
    if (!sessionId.success || !cfg.stripe) return res.status(400).json({ error: "Nothing to confirm." });
    try {
      const session = await cfg.stripe.checkout.sessions.retrieve(sessionId.data.sessionId);
      if (session.metadata?.userId !== req.user!.id) return res.status(404).json({ error: "Payment not found." });
      if (session.payment_status !== "paid") return res.json({ paid: false });
      const done = fulfill(db, session, cfg.now());
      if (!done) return res.status(404).json({ error: "Payment not found." });
      res.json({ paid: true, projectId: done.projectId, plan: planOf(db, done.projectId) });
    } catch (err) {
      console.error("stripe confirm failed", err);
      res.status(502).json({ error: "We couldn't confirm the payment yet. If you were charged, it will appear within a minute." });
    }
  });

  return r;
}

const pid = (req: Request) => String(req.params.id);

export const PLAN_PRICES = Object.fromEntries(PLANS.map((p) => [p.id, p.price]));
