// @vitest-environment node
import request from "supertest";
import { createApp, type ClaudeLike } from "./app";

function fakeClient(reply: unknown, stop_reason = "end_turn") {
  const calls: any[] = [];
  const client = {
    beta: {
      messages: {
        create: async (params: any) => {
          calls.push(params);
          return { stop_reason, content: [{ type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply) }] };
        },
      },
    },
  } as unknown as ClaudeLike;
  return { client, calls };
}

const extracted = {
  businessName: "Summit Roofing LLC", agentName: "Maria", phone: "", email: "", website: "", licenseNumber: "RC-1",
  yearsInBusiness: 14, insured: "yes", reviewRating: 4.8, reviewCount: 300, total: 14250,
  lineItems: [{ description: "Tear-off", amount: 2400 }],
  scope: [{ id: "tearoff", status: "included" }, { id: "bogus", status: "included" }],
  timelineDays: 3, warrantyLaborYears: 10, warrantyMaterialsYears: 50, depositPercent: 10, cashOnly: false, validUntil: "", notes: "",
};

describe("API without an AI key", () => {
  const app = createApp(null);
  it("reports AI off", async () => {
    const r = await request(app).get("/api/health");
    expect(r.body).toEqual({ ok: true, ai: false });
  });
  it("returns 503 so the browser falls back to its own reader", async () => {
    const r = await request(app).post("/api/extract").send({ tradeId: "roofing", text: "hi" });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe("ai_disabled");
  });
});

describe("API with an AI key", () => {
  it("validates input", async () => {
    const { client } = fakeClient(extracted);
    const app = createApp(client);
    expect((await request(app).post("/api/extract").send({ tradeId: "roofing" })).status).toBe(400);
    expect((await request(app).post("/api/extract").send({ tradeId: "nope", text: "x" })).status).toBe(400);
  });

  it("extracts a quote and keeps only known scope ids", async () => {
    const { client, calls } = fakeClient(extracted);
    const r = await request(createApp(client)).post("/api/extract").send({ tradeId: "roofing", text: "Summit Roofing quote" });
    expect(r.status).toBe(200);
    expect(r.body.contractor.businessName).toBe("Summit Roofing LLC");
    expect(r.body.total).toBe(14250);
    expect(r.body.scope).toEqual({ tearoff: "included" });
    expect(r.body.source).toBe("text");
    expect(calls[0].model).toBe("claude-opus-5-5");
    expect(calls[0].output_config.format.type).toBe("json_schema");
  });

  it("sends PDFs as documents", async () => {
    const { client, calls } = fakeClient(extracted);
    const r = await request(createApp(client)).post("/api/extract").send({ tradeId: "roofing", file: { data: "JVBERi0=", mediaType: "application/pdf" } });
    expect(r.status).toBe(200);
    expect(r.body.source).toBe("pdf");
    expect(calls[0].messages[0].content[0].type).toBe("document");
  });

  it("handles refusals and malformed output", async () => {
    expect((await request(createApp(fakeClient(extracted, "refusal").client)).post("/api/extract").send({ tradeId: "roofing", text: "x" })).status).toBe(422);
    expect((await request(createApp(fakeClient("not json").client)).post("/api/extract").send({ tradeId: "roofing", text: "x" })).status).toBe(500);
  });

  it("answers advisor questions with the analysis as context (Advisor plan)", async () => {
    const { client, calls } = fakeClient("Hire Summit.");
    const app = createApp(client, { demoCheckout: true });
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "a@example.com", password: "correct horse battery" });
    await agent.put("/api/projects/p_abc123").send({ id: "p_abc123", quotes: [] });
    await agent.post("/api/projects/p_abc123/checkout").send({ plan: "pro" });
    const r = await agent.post("/api/advisor").send({ question: "Who?", context: "ANALYSIS", history: [], projectId: "p_abc123" });
    expect(r.body.answer).toBe("Hire Summit.");
    expect(calls[0].system).toContain("ANALYSIS");
  });
});
