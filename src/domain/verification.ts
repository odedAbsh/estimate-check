import type { Contractor } from "./types";

export type LicenseStatus = "active" | "expired" | "suspended" | "not_found" | "not_provided";

export interface LicenseResult {
  status: LicenseStatus;
  number: string;
  classification: string;
  expires: string | null;
  board: string;
}

export type CaseType =
  | "Breach of contract"
  | "Defective workmanship"
  | "Mechanic's lien"
  | "Consumer fraud complaint"
  | "Unpaid subcontractor"
  | "Personal injury on job site";

export interface CourtCase {
  caseType: CaseType;
  role: "defendant" | "plaintiff";
  filed: string; // ISO date
  outcome: "open" | "settled" | "judgment against" | "judgment for" | "dismissed";
  summary: string;
}

export interface BusinessResult {
  entityStatus: "active" | "inactive" | "not_found";
  yearsRegistered: number | null;
  complaints: number;
}

export interface VerificationReport {
  source: "demo" | "live";
  checkedAt: string;
  business?: BusinessResult;
  license?: LicenseResult;
  courtRecords?: CourtCase[];
}

export interface VerificationOptions {
  state: string;
  tradeLabel: string;
  business: boolean;
  license: boolean;
  courtRecords: boolean;
}

/**
 * The seam where real data sources plug in: state licensing boards, Secretary
 * of State entity search, and a court-records vendor. Swap DemoVerificationProvider
 * for a live implementation without touching the UI or scoring.
 */
export interface VerificationProvider {
  verify(contractor: Contractor, opts: VerificationOptions): Promise<VerificationReport>;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(llc|inc|co|corp|company|ltd)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Profile = "clean" | "expired" | "lawsuits" | "unregistered" | "suspended";

/** Names that always produce a given result, so demos and tests are predictable. */
const SEEDED: Record<string, Profile> = {
  "summit roofing": "clean",
  "brightline hvac": "clean",
  "quickfix roofing": "lawsuits",
  "budget pro builders": "lawsuits",
  "rapid home services": "expired",
  "lone star exteriors": "suspended",
  "cash deal contracting": "unregistered",
};

function profileFor(c: Contractor): Profile {
  const seeded = SEEDED[normalizeName(c.businessName)];
  if (seeded) return seeded;
  const n = hash(normalizeName(c.businessName) + "|" + c.licenseNumber.trim()) % 10;
  if (n <= 5) return "clean";
  if (n === 6) return "expired";
  if (n === 7 || n === 8) return "lawsuits";
  return "unregistered";
}

function isoYearsAgo(now: Date, years: number, monthOffset = 0): string {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - years);
  d.setMonth(d.getMonth() - monthOffset);
  return d.toISOString().slice(0, 10);
}

export class DemoVerificationProvider implements VerificationProvider {
  constructor(private now: () => Date = () => new Date()) {}

  async verify(c: Contractor, opts: VerificationOptions): Promise<VerificationReport> {
    const now = this.now();
    const profile = profileFor(c);
    const report: VerificationReport = { source: "demo", checkedAt: now.toISOString() };
    const h = hash(normalizeName(c.businessName));

    if (opts.business) {
      report.business =
        profile === "unregistered"
          ? { entityStatus: "not_found", yearsRegistered: null, complaints: 0 }
          : {
              entityStatus: "active",
              yearsRegistered: c.yearsInBusiness ?? 2 + (h % 15),
              complaints: profile === "lawsuits" ? 4 + (h % 5) : h % 2,
            };
    }

    if (opts.license) {
      const board = `${opts.state || "State"} contractor licensing board`;
      if (!c.licenseNumber.trim()) {
        report.license = { status: "not_provided", number: "", classification: "", expires: null, board };
      } else if (profile === "unregistered") {
        report.license = { status: "not_found", number: c.licenseNumber, classification: "", expires: null, board };
      } else {
        const expires = new Date(now);
        expires.setMonth(expires.getMonth() + (profile === "expired" ? -5 : 14));
        report.license = {
          status: profile === "expired" ? "expired" : profile === "suspended" ? "suspended" : "active",
          number: c.licenseNumber,
          classification: opts.tradeLabel,
          expires: expires.toISOString().slice(0, 10),
          board,
        };
      }
    }

    if (opts.courtRecords) {
      const cases: CourtCase[] = [];
      if (profile === "lawsuits") {
        cases.push(
          {
            caseType: "Defective workmanship",
            role: "defendant",
            filed: isoYearsAgo(now, 1, 3),
            outcome: "judgment against",
            summary: "Homeowner alleged leaks within months of installation; court awarded repair costs.",
          },
          {
            caseType: "Mechanic's lien",
            role: "defendant",
            filed: isoYearsAgo(now, 0, 8),
            outcome: "open",
            summary: "Material supplier filed a lien on a client's home over unpaid materials.",
          },
          {
            caseType: "Breach of contract",
            role: "defendant",
            filed: isoYearsAgo(now, 2, 1),
            outcome: "settled",
            summary: "Job abandoned after deposit was paid; settled out of court.",
          },
        );
      } else if (profile === "suspended") {
        cases.push({
          caseType: "Consumer fraud complaint",
          role: "defendant",
          filed: isoYearsAgo(now, 1),
          outcome: "open",
          summary: "State attorney general complaint over deposits taken for work not started.",
        });
      } else if (h % 4 === 0) {
        cases.push({
          caseType: "Breach of contract",
          role: "plaintiff",
          filed: isoYearsAgo(now, 3),
          outcome: "judgment for",
          summary: "Contractor sued a client for non-payment and won.",
        });
      }
      report.courtRecords = cases;
    }

    return report;
  }
}

export const verificationProvider: VerificationProvider = new DemoVerificationProvider();
