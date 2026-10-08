import { extractFromText, mergeExtracted } from "./extract";
import { getTrade } from "./trades";
import { SAMPLE_QUOTES } from "./samples";
import { emptyQuote } from "./quote";

const roofing = getTrade("roofing");
const [summit, quickfix, rapid] = SAMPLE_QUOTES.map((s) => extractFromText(s.text, roofing));

describe("extractFromText", () => {
  it("reads contractor details", () => {
    expect(summit.contractor?.businessName).toBe("Summit Roofing LLC");
    expect(summit.contractor?.licenseNumber).toBe("RC-448120");
    expect(summit.contractor?.phone).toBe("(512) 555-0142");
    expect(summit.contractor?.email).toBe("office@summitroofing.example");
    expect(summit.contractor?.insured).toBe("yes");
    expect(summit.contractor?.yearsInBusiness).toBe(14);
    expect(summit.contractor?.reviewRating).toBe(4.8);
    expect(summit.contractor?.reviewCount).toBe(312);
    expect(summit.contractor?.agentName).toBe("Maria Lopez");
  });

  it("finds the total, not the biggest line item", () => {
    expect(summit.total).toBe(14250);
    expect(quickfix.total).toBe(9600);
    expect(rapid.total).toBe(16000);
  });

  it("reads line items but skips totals and payment lines", () => {
    expect(summit.lineItems).toHaveLength(8);
    expect(summit.lineItems?.[0]).toEqual({ description: "Tear-off of existing shingles (1 layer)", amount: 2400 });
    expect(summit.lineItems?.some((i) => /total/i.test(i.description))).toBe(false);
  });

  it("reads terms", () => {
    expect(summit.depositPercent).toBe(10);
    expect(summit.timelineDays).toBe(3);
    expect(summit.warrantyLaborYears).toBe(10);
    expect(summit.warrantyMaterialsYears).toBe(50);
    expect(summit.validUntil).toBe("2026-12-31");
    expect(rapid.depositPercent).toBe(30);
    expect(rapid.timelineDays).toBe(7);
    expect(rapid.warrantyLaborYears).toBe(5);
    expect(rapid.warrantyMaterialsYears).toBe(30);
    expect(quickfix.depositPercent).toBe(50);
    expect(quickfix.cashOnly).toBe(true);
  });

  it("marks scope items included, excluded or unclear", () => {
    expect(summit.scope).toMatchObject({ tearoff: "included", permits: "included", cleanup: "included", flashing: "included" });
    expect(quickfix.scope).toMatchObject({ tearoff: "excluded", permits: "excluded", decking: "excluded", flashing: "included", cleanup: "unclear" });
  });

  it("does not invent a license when there is none", () => {
    expect(quickfix.contractor?.licenseNumber).toBeUndefined();
  });

  it("computes deposit percent from a dollar deposit", () => {
    const x = extractFromText("Acme Plumbing\nTotal: $2,000\nDeposit $500", getTrade("plumbing"));
    expect(x.depositPercent).toBe(25);
  });
});

describe("mergeExtracted", () => {
  it("fills blanks without overwriting what the user typed", () => {
    const q = emptyQuote();
    q.contractor.businessName = "My name for them";
    q.total = 100;
    const merged = mergeExtracted(q, summit);
    expect(merged.contractor.businessName).toBe("My name for them");
    expect(merged.total).toBe(100);
    expect(merged.contractor.licenseNumber).toBe("RC-448120");
    expect(merged.scope.tearoff).toBe("included");
  });
});
