// @vitest-environment node
import request from "supertest";
import { createApp } from "./app";
import { lookupLicense, namesMatch, usDateToIso } from "./licenses";

// Shape copied from a real record in the Oregon CCB "Active Licenses" dataset (data.oregon.gov g77e-6bhs).
const row = {
  license_number: "100215",
  license_type: "RGC",
  lic_exp_date: "02/06/2028",
  bond_company: "WESTERN SURETY COMPANY",
  bond_amount: "25000",
  bond_exp_date: "02/06/2028",
  ins_company: "SCOTTSDALE INSURANCE CO",
  ins_amount: "1000000",
  ins_exp_date: "08/25/2027",
  full_name: "BRUCE HUIE",
  rmi_name: "BRUCE HUIE",
  endorsement_text: "Residential General Contractor",
};

function fakeFetch(rows: unknown[], status = 200) {
  const urls: string[] = [];
  const impl = (async (url: string) => {
    urls.push(url);
    return { ok: status === 200, status, json: async () => rows } as Response;
  }) as unknown as typeof fetch;
  return { impl, urls };
}

const today = new Date("2026-10-08T12:00:00Z");

describe("namesMatch", () => {
  it("matches on shared meaningful words, ignoring LLC/Inc", () => {
    expect(namesMatch("Summit Roofing LLC", "SUMMIT ROOFING & EXTERIORS INC")).toBe(true);
    expect(namesMatch("Bruce Huie Construction", "BRUCE HUIE")).toBe(true);
    expect(namesMatch("QuickFix Roofing", "BRUCE HUIE", "BRUCE HUIE")).toBe(false);
  });
  it("returns null when it can't tell", () => {
    expect(namesMatch("", "BRUCE HUIE")).toBeNull();
    expect(namesMatch("Acme", undefined)).toBeNull();
  });
});

describe("Oregon CCB lookup", () => {
  it("parses dates", () => {
    expect(usDateToIso("02/06/2028")).toBe("2028-02-06");
    expect(usDateToIso("bad")).toBeNull();
  });

  it("returns an active license with bond and insurance", async () => {
    const { impl, urls } = fakeFetch([row]);
    const r = await lookupLicense("OR", "CCB #100215", "Bruce Huie Construction", { today, fetchImpl: impl });
    expect(urls[0]).toContain("license_number=100215");
    expect(r).toMatchObject({
      status: "active",
      source: "live",
      holderName: "BRUCE HUIE",
      nameMatch: true,
      classification: "Residential General Contractor",
      expires: "2028-02-06",
      bond: { company: "WESTERN SURETY COMPANY", amount: 25000, expires: "2028-02-06" },
      insurance: { amount: 1000000, expires: "2027-08-25" },
    });
  });

  it("flags a license held by someone else", async () => {
    const { impl } = fakeFetch([row]);
    const r = await lookupLicense("OR", "100215", "QuickFix Roofing", { today, fetchImpl: impl });
    expect(r?.nameMatch).toBe(false);
  });

  it("marks a lapsed expiry date as expired", async () => {
    const { impl } = fakeFetch([{ ...row, lic_exp_date: "01/01/2026" }]);
    expect((await lookupLicense("OR", "100215", "Bruce Huie", { today, fetchImpl: impl }))?.status).toBe("expired");
  });

  it("returns not_found when there's no active license with that number", async () => {
    const { impl } = fakeFetch([]);
    expect((await lookupLicense("OR", "999999", "X Co", { today, fetchImpl: impl }))?.status).toBe("not_found");
  });

  it("doesn't call the state for a nonsense number", async () => {
    const { impl, urls } = fakeFetch([row]);
    expect((await lookupLicense("OR", "abc", "X", { today, fetchImpl: impl }))?.status).toBe("not_found");
    expect(urls).toHaveLength(0);
  });

  it("returns null for states without a live source", async () => {
    expect(await lookupLicense("TX", "123456", "X")).toBeNull();
  });

  it("throws when the state's service is down so the caller can say 'unavailable'", async () => {
    const { impl } = fakeFetch([], 503);
    await expect(lookupLicense("OR", "100215", "X", { today, fetchImpl: impl })).rejects.toThrow();
  });
});

describe("GET /api/license", () => {
  it("returns the live record", async () => {
    const app = createApp(null, { fetchImpl: fakeFetch([row]).impl, now: () => today });
    const r = await request(app).get("/api/license").query({ state: "OR", number: "100215", name: "Bruce Huie" });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("active");
  });
  it("says unsupported for other states instead of inventing data", async () => {
    const r = await request(createApp(null)).get("/api/license").query({ state: "CA", number: "123456", name: "X" });
    expect(r.body).toEqual({ status: "unsupported" });
  });
  it("says unavailable when the state is down", async () => {
    const app = createApp(null, { fetchImpl: fakeFetch([], 503).impl });
    const r = await request(app).get("/api/license").query({ state: "OR", number: "100215", name: "X" });
    expect(r.status).toBe(502);
    expect(r.body.status).toBe("unavailable");
  });
  it("validates input", async () => {
    expect((await request(createApp(null)).get("/api/license").query({ state: "Oregon", number: "1" })).status).toBe(400);
  });
});
