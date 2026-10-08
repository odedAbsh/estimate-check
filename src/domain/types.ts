import type { VerificationReport } from "./verification";

export type ScopeStatus = "included" | "excluded" | "unclear";

export type InsuranceStatus = "yes" | "no" | "unknown";

export interface LineItem {
  description: string;
  amount: number;
}

/** The person who presented the offer (sales rep, estimator, owner). */
export interface AgentRating {
  professionalism: number | null; // 1-5
  clarity: number | null; // 1-5, did they explain the quote clearly
  responsiveness: number | null; // 1-5
  pressure: boolean; // used pressure tactics ("price only good today")
  comment: string;
}

export interface Contractor {
  businessName: string;
  agentName: string;
  phone: string;
  email: string;
  website: string;
  licenseNumber: string;
  yearsInBusiness: number | null;
  insured: InsuranceStatus;
  reviewRating: number | null; // 1-5 average on Google/Yelp/Angi etc.
  reviewCount: number | null;
}

export interface Quote {
  id: string;
  contractor: Contractor;
  total: number | null;
  lineItems: LineItem[];
  scope: Record<string, ScopeStatus>;
  timelineDays: number | null;
  warrantyLaborYears: number | null;
  warrantyMaterialsYears: number | null;
  depositPercent: number | null;
  cashOnly: boolean;
  validUntil: string; // ISO date or ""
  notes: string;
  rawText: string;
  source: "form" | "text" | "pdf" | "image";
  agent: AgentRating;
}

export type FactorKey =
  | "price"
  | "scope"
  | "credentials"
  | "reputation"
  | "timeline"
  | "warranty"
  | "payment"
  | "communication";

export type Priorities = Record<FactorKey, number>; // 0 (ignore) .. 5 (critical)

export type PlanId = "basic" | "plus" | "pro";

export interface Project {
  id: string;
  title: string;
  tradeId: string;
  description: string;
  state: string; // US state code
  zip: string;
  createdAt: string;
  updatedAt: string;
  quotes: Quote[];
  priorities: Priorities | null;
  plan: PlanId | null;
  hiredQuoteId: string | null;
  /** Background-check results keyed by quote id, with the contractor fingerprint they were run for. */
  verifications: Record<string, { key: string; report: VerificationReport }>;
}

export type Severity = "critical" | "warning" | "info";

export interface Flag {
  severity: Severity;
  code: string;
  title: string;
  detail: string;
}
