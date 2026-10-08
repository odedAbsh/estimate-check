// @vitest-environment node
import request from "supertest";
import Stripe from "stripe";
import { createApp, type ClaudeLike } from "./app";
import { openDb } from "./db";
import { hashPassword, verifyPassword } from "./auth";
import type { StripeLike } from "./billing";

const NOW = new Date("2026-10-08T12:00:00Z");
const PASSWORD = "correct horse battery";

function project(id = "p_abc123", quotes = 3, extra: Record<string, unknown> = {}) {
  return { id, title: "Roof", tradeId: "roofing", state: "OR", quotes: Array.from({ length: quotes }, (_, i) => ({ id: `q${i}` })), ...extra };
}

async function signedIn(app: ReturnType<typeof createApp>, email = "a@example.com") {
  const agent = request.agent(app);
  const r = await agent.post("/api/auth/register").send({ email, password: PASSWORD });
  expect(r.status).toBe(201);
  return agent;
}

describe("passwords", () => {
  it("hashes with a salt and verifies", () => {
    const h = hashPassword("hunter2hunter2");
    expect(h).not.toContain("hunter2");
    expect(hashPassword("hunter2hunter2")).not.toBe(h);
    expect(verifyPassword("hunter2hunter2", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("accounts", () => {
  const make = () => createApp(null, { db: openDb(":memory:"), now: () => NOW });

  it("registers, keeps you signed in, and signs out", async () => {
    const agent = await signedIn(make());
    expect((await agent.get("/api/auth/me")).body.user.email).toBe("a@example.com");
    await agent.post("/api/auth/logout");
    expect((await agent.get("/api/auth/me")).body.user).toBeNull();
  });

  it("sets a hardened session cookie", async () => {
    const app = createApp(null, { db: openDb(":memory:"), now: () => NOW, secureCookies: true });
    const r = await request(app).post("/api/auth/register").send({ email: "b@example.com", password: PASSWORD });
    const cookie = String(r.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Secure/);
  });

  it("validates email and password, and rejects duplicates", async () => {
    const app = make();
    expect((await request(app).post("/api/auth/register").send({ email: "nope", password: PASSWORD })).body.error).toMatch(/valid email/);
    expect((await request(app).post("/api/auth/register").send({ email: "c@example.com", password: "short" })).body.error).toMatch(/at least 10/);
    await request(app).post("/api/auth/register").send({ email: "c@example.com", password: PASSWORD });
    const dup = await request(app).post("/api/auth/register").send({ email: "C@Example.com", password: PASSWORD });
    expect(dup.status).toBe(409);
  });

  it("logs in with the right password only, with one message for both failures", async () => {
    const app = make();
    await request(app).post("/api/auth/register").send({ email: "d@example.com", password: PASSWORD });
    expect((await request(app).post("/api/auth/login").send({ email: "d@example.com", password: PASSWORD })).status).toBe(200);
    const bad = await request(app).post("/api/auth/login").send({ email: "d@example.com", password: "wrong password" });
    const unknown = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "wrong password" });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe(unknown.body.error);
  });

  it("slows down repeated guessing", async () => {
    const app = make();
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await request(app).post("/api/auth/login").send({ email: "e@example.com", password: "guess" + i })).status;
    expect(last).toBe(429);
  });

  it("expires sessions", async () => {
    let t = NOW;
    const app = createApp(null, { db: openDb(":memory:"), now: () => t });
    const agent = await signedIn(app);
    t = new Date(NOW.getTime() + 31 * 24 * 3600 * 1000);
    expect((await agent.get("/api/auth/me")).body.user).toBeNull();
  });

  it("blocks cross-site writes", async () => {
    const r = await request(make()).post("/api/auth/register").set("Origin", "https://evil.example").send({ email: "f@example.com", password: PASSWORD });
    expect(r.status).toBe(403);
  });
});

describe("projects", () => {
  it("requires sign-in", async () => {
    expect((await request(createApp(null)).get("/api/projects")).status).toBe(401);
  });

  it("saves, lists and deletes only your own", async () => {
    const app = createApp(null, { db: openDb(":memory:"), now: () => NOW });
    const alice = await signedIn(app, "alice@example.com");
    const bob = await signedIn(app, "bob@example.com");
    await alice.put("/api/projects/p_abc123").send(project());
    expect((await alice.get("/api/projects")).body.projects).toHaveLength(1);
    expect((await bob.get("/api/projects")).body.projects).toHaveLength(0);
    expect((await bob.get("/api/projects/p_abc123")).status).toBe(404);
    expect((await bob.put("/api/projects/p_abc123").send(project())).status).toBe(404);
    await bob.delete("/api/projects/p_abc123");
    expect((await alice.get("/api/projects")).body.projects).toHaveLength(1);
    await alice.delete("/api/projects/p_abc123");
    expect((await alice.get("/api/projects")).body.projects).toHaveLength(0);
  });

  it("never trusts a plan sent by the browser", async () => {
    const app = createApp(null, { db: openDb(":memory:"), now: () => NOW });
    const agent = await signedIn(app);
    const r = await agent.put("/api/projects/p_abc123").send(project("p_abc123", 3, { plan: "pro" }));
    expect(r.body.project.plan).toBeNull();
  });

  it("rejects mismatched ids, too many quotes and oversized projects", async () => {
    const agent = await signedIn(createApp(null, { db: openDb(":memory:"), now: () => NOW }));
    expect((await agent.put("/api/projects/p_other1").send(project("p_abc123"))).status).toBe(400);
    expect((await agent.put("/api/projects/p_abc123").send(project("p_abc123", 10))).status).toBe(400);
    expect((await agent.put("/api/projects/p_abc123").send(project("p_abc123", 1, { blob: "x".repeat(700_000) }))).status).toBe(413);
  });
});

describe("demo checkout (development)", () => {
  const make = () => createApp(null, { db: openDb(":memory:"), demoCheckout: true, now: () => NOW });

  it("grants the plan and charges the difference on upgrade", async () => {
    const app = make();
    const agent = await signedIn(app);
    await agent.put("/api/projects/p_abc123").send(project());
    expect((await agent.post("/api/projects/p_abc123/checkout").send({ plan: "basic" })).body).toEqual({ demo: true, plan: "basic" });
    expect((await agent.post("/api/projects/p_abc123/checkout").send({ plan: "basic" })).status).toBe(409); // already have it
    expect((await agent.post("/api/projects/p_abc123/checkout").send({ plan: "pro" })).body.plan).toBe("pro");
    expect((await agent.get("/api/projects/p_abc123")).body.project.plan).toBe("pro");
  });

  it("refuses a plan too small for the quotes", async () => {
    const agent = await signedIn(make());
    await agent.put("/api/projects/p_abc123").send(project("p_abc123", 5));
    const r = await agent.post("/api/projects/p_abc123/checkout").send({ plan: "basic" });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/up to 3 quotes/);
  });

  it("is off when neither Stripe nor demo mode is configured", async () => {
    const app = createApp(null, { db: openDb(":memory:"), now: () => NOW });
    const agent = await signedIn(app);
    await agent.put("/api/projects/p_abc123").send(project());
    expect((await agent.post("/api/projects/p_abc123/checkout").send({ plan: "basic" })).status).toBe(503);
    expect((await request(app).get("/api/config")).body.payments).toBe("off");
  });
});

describe("Stripe", () => {
  const SECRET = "whsec_test_secret";
  const stripeLib = new Stripe("sk_test_dummy");

  function fakeStripe() {
    const created: Stripe.Checkout.SessionCreateParams[] = [];
    const sessions = new Map<string, Partial<Stripe.Checkout.Session>>();
    const stripe: StripeLike = {
      checkout: {
        sessions: {
          create: async (params) => {
            created.push(params);
            return { id: "cs_test_1", url: "https://checkout.stripe.test/pay/cs_test_1" };
          },
          retrieve: async (id) => sessions.get(id) as Stripe.Checkout.Session,
        },
      },
      webhooks: stripeLib.webhooks,
    };
    return { stripe, created, sessions };
  }

  function setup() {
    const f = fakeStripe();
    const app = createApp(null, { db: openDb(":memory:"), stripe: f.stripe, stripeWebhookSecret: SECRET, publicUrl: "https://app.example.test", now: () => NOW });
    return { app, ...f };
  }

  function webhook(app: ReturnType<typeof createApp>, session: object, secret = SECRET, type = "checkout.session.completed") {
    const payload = JSON.stringify({ id: "evt_1", object: "event", type, data: { object: session } });
    const header = stripeLib.webhooks.generateTestHeaderString({ payload, secret });
    return request(app).post("/api/stripe/webhook").set("stripe-signature", header).set("Content-Type", "application/json").send(payload);
  }

  it("creates a Checkout session for the exact amount and sends the buyer back to the results", async () => {
    const { app, created } = setup();
    const agent = await signedIn(app);
    await agent.put("/api/projects/p_abc123").send(project());
    const r = await agent.post("/api/projects/p_abc123/checkout").send({ plan: "plus" });
    expect(r.body.url).toBe("https://checkout.stripe.test/pay/cs_test_1");
    const p = created[0];
    expect(p.mode).toBe("payment");
    expect(p.line_items![0].price_data!.unit_amount).toBe(3900);
    expect(p.metadata).toMatchObject({ projectId: "p_abc123", plan: "plus" });
    expect(p.success_url).toBe("https://app.example.test/#/p/p_abc123/results?session_id={CHECKOUT_SESSION_ID}");
    // Not granted until paid.
    expect((await agent.get("/api/projects/p_abc123")).body.project.plan).toBeNull();
  });

  it("charges only the difference when upgrading", async () => {
    const { app, created } = setup();
    const agent = await signedIn(app);
    const userId = (await agent.get("/api/auth/me")).body.user.id;
    await agent.put("/api/projects/p_abc123").send(project());
    await webhook(app, { id: "cs_1", payment_status: "paid", amount_total: 2900, metadata: { projectId: "p_abc123", userId, plan: "basic" } });
    await agent.post("/api/projects/p_abc123/checkout").send({ plan: "pro" });
    expect(created[0].line_items![0].price_data!.unit_amount).toBe(2000);
  });

  it("grants the plan from a signed webhook, once, even if replayed", async () => {
    const { app } = setup();
    const agent = await signedIn(app);
    const userId = (await agent.get("/api/auth/me")).body.user.id;
    await agent.put("/api/projects/p_abc123").send(project());
    const session = { id: "cs_1", payment_status: "paid", amount_total: 3900, metadata: { projectId: "p_abc123", userId, plan: "plus" } };
    expect((await webhook(app, session)).status).toBe(200);
    expect((await webhook(app, session)).status).toBe(200);
    expect((await agent.get("/api/projects/p_abc123")).body.project.plan).toBe("plus");
  });

  it("rejects webhooks with a bad signature and ignores unpaid sessions", async () => {
    const { app } = setup();
    const agent = await signedIn(app);
    const userId = (await agent.get("/api/auth/me")).body.user.id;
    await agent.put("/api/projects/p_abc123").send(project());
    expect((await webhook(app, { id: "cs_x" }, "whsec_wrong")).status).toBe(400);
    await webhook(app, { id: "cs_2", payment_status: "unpaid", metadata: { projectId: "p_abc123", userId, plan: "pro" } });
    expect((await agent.get("/api/projects/p_abc123")).body.project.plan).toBeNull();
  });

  it("won't grant a plan to someone else's project via a forged webhook payload", async () => {
    const { app } = setup();
    const alice = await signedIn(app, "alice@example.com");
    const bob = await signedIn(app, "bob@example.com");
    const bobId = (await bob.get("/api/auth/me")).body.user.id;
    await alice.put("/api/projects/p_abc123").send(project());
    await webhook(app, { id: "cs_3", payment_status: "paid", amount_total: 100, metadata: { projectId: "p_abc123", userId: bobId, plan: "pro" } });
    expect((await alice.get("/api/projects/p_abc123")).body.project.plan).toBeNull();
  });

  it("confirms a payment when the buyer returns, without waiting for the webhook", async () => {
    const { app, sessions } = setup();
    const agent = await signedIn(app);
    const userId = (await agent.get("/api/auth/me")).body.user.id;
    await agent.put("/api/projects/p_abc123").send(project());
    sessions.set("cs_ret", { id: "cs_ret", payment_status: "paid", amount_total: 4900, metadata: { projectId: "p_abc123", userId, plan: "pro" } });
    const r = await agent.post("/api/billing/confirm").send({ sessionId: "cs_ret" });
    expect(r.body).toEqual({ paid: true, projectId: "p_abc123", plan: "pro" });
    // Someone else can't claim it.
    const other = await signedIn(app, "other@example.com");
    expect((await other.post("/api/billing/confirm").send({ sessionId: "cs_ret" })).status).toBe(404);
  });
});

describe("paid features are enforced on the server", () => {
  const fakeAi: ClaudeLike = {
    beta: { messages: { create: (async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Hire Summit." }] })) as never } },
  };

  async function setup(plan: "basic" | "plus" | "pro" | null) {
    const app = createApp(fakeAi, {
      db: openDb(":memory:"), demoCheckout: true, now: () => NOW,
      fetchImpl: (async () => ({ ok: true, status: 200, json: async () => [] })) as unknown as typeof fetch,
    });
    const agent = await signedIn(app);
    await agent.put("/api/projects/p_abc123").send(project());
    if (plan) await agent.post("/api/projects/p_abc123/checkout").send({ plan });
    return { app, agent };
  }

  const lic = { state: "OR", number: "100215", name: "X", projectId: "p_abc123" };

  it("license checks need an account and a plan that includes them", async () => {
    const { app, agent } = await setup("basic");
    expect((await request(app).get("/api/license").query(lic)).status).toBe(401);
    expect((await agent.get("/api/license").query(lic)).status).toBe(402);
    const { agent: plus } = await setup("plus");
    expect((await plus.get("/api/license").query(lic)).status).toBe(200);
  });

  it("can't use someone else's paid project", async () => {
    const { app } = await setup("plus");
    const mallory = await signedIn(app, "mallory@example.com");
    expect((await mallory.get("/api/license").query(lic)).status).toBe(402);
  });

  it("the advisor needs the Advisor plan", async () => {
    const body = { question: "Who?", context: "ctx", history: [], projectId: "p_abc123" };
    const { agent: plus } = await setup("plus");
    expect((await plus.post("/api/advisor").send(body)).status).toBe(402);
    const { agent: pro } = await setup("pro");
    expect((await pro.post("/api/advisor").send(body)).body.answer).toBe("Hire Summit.");
    expect((await request(createApp(fakeAi)).post("/api/advisor").send(body)).status).toBe(401);
  });
});
