import express, { type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { TRADES, getTrade } from "../src/domain/trades";
import { lookupLicense } from "./licenses";
import { getPlan } from "../src/domain/plans";
import { authRoutes, sameOriginOnly, sessionMiddleware } from "./auth";
import { billingRoutes, webhookRoute, type BillingConfig, type StripeLike } from "./billing";
import { openDb, type Db } from "./db";
import { planOf, projectRoutes } from "./projects";

const MODEL = "claude-opus-5-5";

/** Only the parts of the Anthropic client this server uses, so tests can pass a fake. */
export interface ClaudeLike {
  beta: { messages: { create: Anthropic["beta"]["messages"]["create"] } };
}

const ExtractRequest = z
  .object({
    tradeId: z.enum(TRADES.map((t) => t.id) as [string, ...string[]]),
    text: z.string().max(60_000).optional(),
    file: z
      .object({
        data: z.string().max(14_000_000), // base64, ~10MB file
        mediaType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]),
      })
      .optional(),
  })
  .refine((r) => r.text?.trim() || r.file, { message: "Send quote text or a file." });

const scopeStatus = z.enum(["included", "excluded", "unclear"]);

const ExtractedSchema = z.object({
  businessName: z.string(),
  agentName: z.string(),
  phone: z.string(),
  email: z.string(),
  website: z.string(),
  licenseNumber: z.string(),
  yearsInBusiness: z.number().nullable(),
  insured: z.enum(["yes", "no", "unknown"]),
  reviewRating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  total: z.number().nullable(),
  lineItems: z.array(z.object({ description: z.string(), amount: z.number() })),
  scope: z.array(z.object({ id: z.string(), status: scopeStatus })),
  timelineDays: z.number().nullable(),
  warrantyLaborYears: z.number().nullable(),
  warrantyMaterialsYears: z.number().nullable(),
  depositPercent: z.number().nullable(),
  cashOnly: z.boolean(),
  validUntil: z.string(),
  notes: z.string(),
});

const AdvisorRequest = z.object({
  projectId: z.string().max(80),
  question: z.string().min(1).max(2000),
  context: z.string().max(60_000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(30)
    .default([]),
});

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function sendError(res: Response, err: unknown) {
  if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "The AI service is busy. Try again in a minute." });
  if (err instanceof Anthropic.APIError) return res.status(502).json({ error: "The AI service couldn't read this right now. You can still fill in the form." });
  console.error(err);
  return res.status(500).json({ error: "Something went wrong on our side. You can still fill in the form." });
}

export interface AppDeps {
  db?: Db;
  stripe?: StripeLike | null;
  stripeWebhookSecret?: string;
  publicUrl?: string | null;
  demoCheckout?: boolean;
  secureCookies?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/** Fixed-window limiter by key, for endpoints that cost money (AI) or can be guessed at. */
function rateLimit(max: number, windowMs: number, now: () => Date, key: (req: Request) => string): express.RequestHandler {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req, res, next) => {
    const t = now().getTime();
    const k = key(req);
    const h = hits.get(k);
    if (!h || h.reset < t) hits.set(k, { n: 1, reset: t + windowMs });
    else if (++h.n > max) return res.status(429).json({ error: "Too many requests. Try again in a little while." });
    next();
  };
}

export function createApp(client: ClaudeLike | null, deps: AppDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const db = deps.db ?? openDb(":memory:");
  const billing: BillingConfig = {
    stripe: deps.stripe ?? null,
    webhookSecret: deps.stripeWebhookSecret ?? "",
    publicUrl: deps.publicUrl ?? null,
    demoCheckout: deps.demoCheckout ?? false,
    now,
  };
  const authCfg = { secureCookies: deps.secureCookies ?? false, now };

  const app = express();
  app.set("trust proxy", 1);
  // Stripe signs the raw body, so this route must come before the JSON parser.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }), webhookRoute(db, billing));
  app.use(express.json({ limit: "15mb" }));
  app.use(sameOriginOnly(() => (deps.publicUrl ? [deps.publicUrl] : [])));
  app.use(sessionMiddleware(db, authCfg));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ai: client != null });
  });

  app.use("/api/auth", authRoutes(db, authCfg));
  app.use("/api/projects", projectRoutes(db, now));
  app.use("/api", billingRoutes(db, billing));

  /** Plan entitlement for the signed-in user's project, or null. */
  const entitlement = (req: Request) => {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : typeof req.body?.projectId === "string" ? req.body.projectId : "";
    if (!req.user || !projectId) return null;
    const owned = db.prepare("SELECT 1 FROM projects WHERE id = ? AND user_id = ?").get(projectId, req.user.id);
    return owned ? getPlan(planOf(db, projectId)) : null;
  };

  app.get("/api/license", async (req: Request, res: Response) => {
    const q = z
      .object({ state: z.string().length(2), number: z.string().min(1).max(30), name: z.string().max(200).default("") })
      .safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: "Send state, number and name." });
    if (!req.user) return res.status(401).json({ error: "Sign in to run license checks.", code: "auth_required" });
    if (!entitlement(req)?.licenseCheck) return res.status(402).json({ error: "License verification is part of the Verified plan.", code: "plan_required" });
    try {
      const result = await lookupLicense(q.data.state, q.data.number, q.data.name, { fetchImpl: deps.fetchImpl, today: deps.now?.() });
      if (!result) return res.json({ status: "unsupported" });
      return res.json(result);
    } catch (err) {
      console.error("license lookup failed", err);
      return res.status(502).json({ status: "unavailable" });
    }
  });

  app.post("/api/extract", rateLimit(30, 60 * 60 * 1000, now, (r) => r.user?.id ?? r.ip ?? "anon"), async (req: Request, res: Response) => {
    if (!client) return res.status(503).json({ error: "AI reading isn't set up on this server.", code: "ai_disabled" });
    const parsed = ExtractRequest.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    const { tradeId, text, file } = parsed.data;
    const trade = getTrade(tradeId);

    const instructions = `You read a US home-service quote for a ${trade.label} job and extract its facts.
Only report what the document says. Use "" or null when something isn't stated; never guess a license number, price or warranty.
- total: the final contract price in dollars.
- depositPercent: upfront payment as a percent of the total (convert dollar deposits).
- timelineDays: working days to complete (weeks x 7).
- warranty years: "lifetime" = 25.
- insured: "yes" only if the quote says insured.
- scope: one entry per checklist id below. "included" if the quote clearly covers it, "excluded" if it says it's not included / by owner / extra, otherwise "unclear".
Checklist: ${trade.scope.map((s) => `${s.id} = ${s.label}`).join("; ")}
- notes: anything unusual a homeowner should notice (one or two sentences, or "").`;

    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (file) {
      content.push(
        file.mediaType === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } }
          : { type: "image", source: { type: "base64", media_type: file.mediaType as "image/png", data: file.data } },
      );
    }
    content.push({ type: "text", text: text?.trim() ? `${instructions}\n\nQuote text:\n${text}` : instructions });

    try {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: zodOutputFormat(ExtractedSchema) },
        messages: [{ role: "user", content }],
      });
      if (response.stop_reason === "refusal") return res.status(422).json({ error: "This document couldn't be read automatically. Please fill in the form." });
      const data = ExtractedSchema.parse(JSON.parse(textOf(response.content)));
      const validIds = new Set(trade.scope.map((s) => s.id));
      const { businessName, agentName, phone, email, website, licenseNumber, yearsInBusiness, insured, reviewRating, reviewCount, scope, ...rest } = data;
      return res.json({
        contractor: { businessName, agentName, phone, email, website, licenseNumber, yearsInBusiness, insured, reviewRating, reviewCount },
        ...rest,
        scope: Object.fromEntries(scope.filter((s) => validIds.has(s.id)).map((s) => [s.id, s.status])),
        source: file ? (file.mediaType === "application/pdf" ? "pdf" : "image") : "text",
      });
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.post("/api/advisor", async (req: Request, res: Response) => {
    if (!client) return res.status(503).json({ error: "The AI advisor isn't set up on this server.", code: "ai_disabled" });
    if (!req.user) return res.status(401).json({ error: "Sign in to use the advisor.", code: "auth_required" });
    if (!entitlement(req)?.advisorChat) return res.status(402).json({ error: "The advisor is part of the Advisor plan.", code: "plan_required" });
    const parsed = AdvisorRequest.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    const { question, context, history } = parsed.data;
    try {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: `You are an independent advisor helping a US homeowner choose between contractor quotes. You are not paid by any contractor.
Be direct and specific. Lead with the answer. Use plain language and short paragraphs. Ground every claim in the analysis below and say when something isn't in it.
Background-check results may be sample data; if the analysis says so, remind the user to confirm with the state licensing board before signing.
Never tell the user to skip verifying a license or insurance.

Analysis:
${context}`,
        messages: [...history, { role: "user", content: question }],
      });
      if (response.stop_reason === "refusal") return res.json({ answer: "I can't help with that one. Ask me about the quotes, the contractors or what to negotiate." });
      return res.json({ answer: textOf(response.content) });
    } catch (err) {
      return sendError(res, err);
    }
  });

  return app;
}

export function clientFromEnv(): ClaudeLike | null {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}
