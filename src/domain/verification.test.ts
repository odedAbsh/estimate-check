import { DemoVerificationProvider, normalizeName } from "./verification";
import { emptyQuote } from "./quote";
import { minimumPlanFor, PLANS } from "./plans";

const provider = new DemoVerificationProvider(() => new Date("2026-10-08T00:00:00Z"));
const opts = { state: "TX", tradeLabel: "Roofing", business: true, license: true, courtRecords: true };

function contractor(name: string, license = "AB-12345") {
  const c = emptyQuote().contractor;
  c.businessName = name;
  c.licenseNumber = license;
  return c;
}

describe("DemoVerificationProvider", () => {
  it("normalizes business suffixes", () => {
    expect(normalizeName("Summit Roofing, LLC.")).toBe("summit roofing");
  });

  it("is deterministic", async () => {
    const a = await provider.verify(contractor("Some Random Co"), opts);
    const b = await provider.verify(contractor("Some Random Co"), opts);
    expect(a).toEqual(b);
    expect(a.source).toBe("demo");
  });

  it("only runs the checks the plan includes", async () => {
    const r = await provider.verify(contractor("Summit Roofing"), { ...opts, license: false, courtRecords: false });
    expect(r.business).toBeDefined();
    expect(r.license).toBeUndefined();
    expect(r.courtRecords).toBeUndefined();
  });

  it("reports missing license numbers", async () => {
    const r = await provider.verify(contractor("Summit Roofing", ""), opts);
    expect(r.license?.status).toBe("not_provided");
  });

  it("returns seeded profiles", async () => {
    expect((await provider.verify(contractor("Summit Roofing LLC"), opts)).license?.status).toBe("active");
    expect((await provider.verify(contractor("Rapid Home Services Inc"), opts)).license?.status).toBe("expired");
    expect((await provider.verify(contractor("Lone Star Exteriors"), opts)).license?.status).toBe("suspended");
    expect((await provider.verify(contractor("Cash Deal Contracting"), opts)).business?.entityStatus).toBe("not_found");
    const suits = (await provider.verify(contractor("QuickFix Roofing"), opts)).courtRecords!;
    expect(suits.every((c) => c.role === "defendant")).toBe(true);
    expect(suits.map((c) => c.caseType)).toContain("Mechanic's lien");
  });
});

describe("plans", () => {
  it("matches the agreed pricing", () => {
    expect(PLANS.map((p) => [p.price, p.maxQuotes])).toEqual([[29, 3], [39, 5], [49, 9]]);
    expect(PLANS.find((p) => p.price === 29)!.licenseCheck).toBe(false);
    expect(PLANS.find((p) => p.price === 49)!.advisorChat).toBe(true);
  });

  it("picks the cheapest plan that fits the quote count", () => {
    expect(minimumPlanFor(2)?.id).toBe("basic");
    expect(minimumPlanFor(4)?.id).toBe("plus");
    expect(minimumPlanFor(9)?.id).toBe("pro");
    expect(minimumPlanFor(10)).toBeNull();
  });
});
