import { analyzeProject, median } from "./analysis";
import { extractFromText, mergeExtracted } from "./extract";
import { DemoVerificationProvider } from "./verification";
import { emptyQuote, newProject, DEFAULT_PRIORITIES } from "./quote";
import { getTrade } from "./trades";
import { SAMPLE_QUOTES } from "./samples";
import type { Project } from "./types";

const today = new Date("2026-10-08T12:00:00Z");

function sampleProject(): Project {
  const p = newProject();
  p.tradeId = "roofing";
  p.state = "TX";
  p.quotes = SAMPLE_QUOTES.map((s) => {
    const q = mergeExtracted(emptyQuote(), extractFromText(s.text, getTrade("roofing")));
    q.agent = { ...s.agent, comment: "" };
    return q;
  });
  p.priorities = { ...DEFAULT_PRIORITIES };
  return p;
}

async function verifyAll(p: Project, license = true) {
  const provider = new DemoVerificationProvider(() => today);
  const out: Record<string, Awaited<ReturnType<typeof provider.verify>>> = {};
  for (const q of p.quotes) {
    out[q.id] = await provider.verify(q.contractor, { state: p.state, tradeLabel: "Roofing", business: true, license, courtRecords: license });
  }
  return out;
}

describe("median", () => {
  it("handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("analyzeProject", () => {
  it("prices in what a cheap quote leaves out", () => {
    const a = analyzeProject(sampleProject(), { today });
    const quick = a.quotes.find((q) => q.name === "QuickFix Roofing")!;
    expect(quick.missingItems.map((i) => i.id).sort()).toEqual(["decking", "permits", "tearoff"]);
    expect(quick.missingScopeCost).toBeGreaterThan(0);
    expect(quick.effectivePrice).toBe(quick.total! + quick.missingScopeCost);
  });

  it("recommends the verified, complete quote over the cheapest one", async () => {
    const p = sampleProject();
    p.plan = "plus";
    const a = analyzeProject(p, { today, verifications: await verifyAll(p) });
    const byName = Object.fromEntries(a.quotes.map((q) => [q.name, q]));
    expect(a.cheapestId).toBe(byName["QuickFix Roofing"].quoteId);
    expect(a.recommendedId).toBe(byName["Summit Roofing LLC"].quoteId);
    expect(a.headline).toBe("Hire Summit Roofing LLC.");
    expect(byName["QuickFix Roofing"].notRecommended).toBe(true);
    expect(byName["Rapid Home Services Inc"].notRecommended).toBe(true);
  });

  it("warns about lawsuits and says what they were", async () => {
    const p = sampleProject();
    p.plan = "plus";
    const a = analyzeProject(p, { today, verifications: await verifyAll(p) });
    const quick = a.quotes.find((q) => q.name === "QuickFix Roofing")!;
    const suits = quick.flags.filter((f) => f.code === "lawsuit");
    expect(suits.length).toBe(3);
    expect(suits.map((s) => s.title).join(" ")).toMatch(/Defective workmanship/);
    expect(suits.find((s) => /judgment against/.test(s.title))?.severity).toBe("critical");
  });

  it("flags an expired license as critical", async () => {
    const p = sampleProject();
    p.plan = "plus";
    const a = analyzeProject(p, { today, verifications: await verifyAll(p) });
    const rapid = a.quotes.find((q) => q.name === "Rapid Home Services Inc")!;
    expect(rapid.flags[0]).toMatchObject({ severity: "critical", code: "license_expired" });
  });

  it("says the license wasn't checked on the Essential plan instead of staying silent", async () => {
    const p = sampleProject();
    p.plan = "basic";
    const a = analyzeProject(p, { today, verifications: await verifyAll(p, false) });
    const summit = a.quotes.find((q) => q.name === "Summit Roofing LLC")!;
    expect(summit.flags.some((f) => f.code === "license_unchecked")).toBe(true);
  });

  it("flags deposits, cash-only, pressure and low-balls", () => {
    const a = analyzeProject(sampleProject(), { today });
    const codes = a.quotes.find((q) => q.name === "QuickFix Roofing")!.flags.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["deposit_high", "cash_only", "pressure", "lowball", "scope_missing", "license_missing", "no_warranty"]));
  });

  it("follows the user's priorities", () => {
    const p = sampleProject();
    // Remove red flags from QuickFix so only priorities decide.
    const quick = p.quotes[1];
    quick.contractor.licenseNumber = "X-12345";
    quick.contractor.insured = "yes";
    quick.depositPercent = 10;
    quick.cashOnly = false;
    quick.agent.pressure = false;
    quick.scope = { ...p.quotes[0].scope };
    p.priorities = { price: 5, scope: 0, credentials: 0, reputation: 0, timeline: 0, warranty: 0, payment: 0, communication: 0 };
    expect(analyzeProject(p, { today }).ranking[0]).toBe(quick.id);
    p.priorities = { price: 0, scope: 0, credentials: 0, reputation: 0, timeline: 0, warranty: 5, payment: 0, communication: 0 };
    expect(analyzeProject(p, { today }).ranking[0]).toBe(p.quotes[0].id);
  });

  it("refuses to recommend when every quote has a red flag", () => {
    const p = sampleProject();
    for (const q of p.quotes) q.contractor.insured = "no";
    const a = analyzeProject(p, { today });
    expect(a.recommendedId).toBeNull();
    expect(a.headline).toMatch(/None of these quotes is safe/);
  });

  it("asks targeted questions", () => {
    const a = analyzeProject(sampleProject(), { today });
    const qs = a.quotes.find((q) => q.name === "QuickFix Roofing")!.questions.join("\n");
    expect(qs).toMatch(/excludes tear-off of old roof/i);
    expect(qs).toMatch(/license number/i);
    expect(qs).toMatch(/50% deposit/);
  });

  it("handles an empty project and missing data without crashing", () => {
    expect(analyzeProject(newProject(), { today }).headline).toMatch(/Add your quotes/);
    const p = newProject();
    p.quotes = [emptyQuote(), emptyQuote()];
    const a = analyzeProject(p, { today });
    expect(a.quotes).toHaveLength(2);
    expect(a.quotes[0].factors.price.score).toBeNull();
  });

  it("flags expired quotes", () => {
    const p = sampleProject();
    p.quotes[0].validUntil = "2026-01-01";
    const a = analyzeProject(p, { today });
    expect(a.quotes[0].flags.some((f) => f.code === "expired_quote")).toBe(true);
  });
});

describe("live license results", () => {
  const base = { number: "100215", classification: "RGC", expires: "2028-02-06", board: "Oregon Construction Contractors Board", source: "live" as const };

  function runWith(license: import("./verification").LicenseResult) {
    const p = sampleProject();
    p.plan = "plus";
    const q = p.quotes[0];
    return analyzeProject(p, { today, verifications: { [q.id]: { source: "live", checkedAt: today.toISOString(), license } } }).quotes[0];
  }

  it("flags a license that belongs to a different business as critical", () => {
    const a = runWith({ ...base, status: "active", holderName: "BRUCE HUIE", nameMatch: false, bond: null, insurance: null });
    expect(a.flags.find((f) => f.code === "license_name_mismatch")?.severity).toBe("critical");
    expect(a.notRecommended).toBe(true);
  });

  it("warns when the state shows no bond or lapsed insurance", () => {
    const a = runWith({ ...base, status: "active", nameMatch: true, bond: null, insurance: { company: "X", amount: 1_000_000, expires: "2026-01-01" } });
    const codes = a.flags.map((f) => f.code);
    expect(codes).toContain("bond_issue");
    expect(codes).toContain("insurance_issue");
  });

  it("is quiet when the record is clean", () => {
    const a = runWith({
      ...base, status: "active", nameMatch: true,
      bond: { company: "W", amount: 25000, expires: "2028-02-06" },
      insurance: { company: "S", amount: 1_000_000, expires: "2027-08-25" },
    });
    expect(a.flags.some((f) => /license|bond|insurance_issue/.test(f.code))).toBe(false);
    expect(a.factors.credentials.note).toContain("verified active in state records");
  });

  it("says plainly when a state can't be verified, with a link, and doesn't mark it as a red flag", () => {
    const a = runWith({ status: "unsupported", number: "123", classification: "", expires: null, board: "California CSLB", source: "none", lookupUrl: "https://example.test/lookup" });
    const f = a.flags.find((x) => x.code === "license_unsupported")!;
    expect(f.severity).toBe("info");
    expect(f.detail).toContain("https://example.test/lookup");
    expect(a.notRecommended).toBe(false);
  });
});
