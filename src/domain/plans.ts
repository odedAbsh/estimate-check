import type { PlanId } from "./types";

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  maxQuotes: number;
  businessCheck: boolean;
  licenseCheck: boolean;
  courtRecords: boolean;
  advisorChat: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "Essential",
    price: 29,
    maxQuotes: 3,
    businessCheck: true,
    licenseCheck: false,
    courtRecords: false,
    advisorChat: false,
    features: [
      "Compare up to 3 quotes",
      "Business background check (registration, age, complaints)",
      "Line-by-line analysis of each quote's logic",
      "Recommendation with reasons",
    ],
  },
  {
    id: "plus",
    name: "Verified",
    price: 39,
    maxQuotes: 5,
    businessCheck: true,
    licenseCheck: true,
    courtRecords: true,
    advisorChat: false,
    features: [
      "Compare up to 5 quotes",
      "Everything in Essential",
      "State license verification",
      "In-depth check: lawsuits, liens and their nature",
      "Strengths of each provider and best-value pick",
    ],
  },
  {
    id: "pro",
    name: "Advisor",
    price: 49,
    maxQuotes: 9,
    businessCheck: true,
    licenseCheck: true,
    courtRecords: true,
    advisorChat: true,
    features: [
      "Compare up to 9 quotes",
      "Everything in Verified",
      "Advisor chat to talk through the final decision",
    ],
  },
];

/** Free preview: the side-by-side and document-level warnings, no verdict or checks. */
export const FREE_MAX_QUOTES = 9;

export function getPlan(id: PlanId | null): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null;
}

/** The cheapest plan that can analyze this many quotes. */
export function minimumPlanFor(quoteCount: number): Plan | null {
  return PLANS.find((p) => p.maxQuotes >= quoteCount) ?? null;
}

export function canUsePlan(plan: Plan, quoteCount: number): boolean {
  return quoteCount <= plan.maxQuotes;
}
