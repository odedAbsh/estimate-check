import type { FactorKey, Priorities, Project, Quote } from "./types";

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function emptyQuote(): Quote {
  return {
    id: uid("q"),
    contractor: {
      businessName: "",
      agentName: "",
      phone: "",
      email: "",
      website: "",
      licenseNumber: "",
      yearsInBusiness: null,
      insured: "unknown",
      reviewRating: null,
      reviewCount: null,
    },
    total: null,
    lineItems: [],
    scope: {},
    timelineDays: null,
    warrantyLaborYears: null,
    warrantyMaterialsYears: null,
    depositPercent: null,
    cashOnly: false,
    validUntil: "",
    notes: "",
    rawText: "",
    source: "form",
    agent: { professionalism: null, clarity: null, responsiveness: null, pressure: false, comment: "" },
  };
}

export function newProject(): Project {
  const now = new Date().toISOString();
  return {
    id: uid("p"),
    title: "",
    tradeId: "roofing",
    description: "",
    state: "",
    zip: "",
    createdAt: now,
    updatedAt: now,
    quotes: [],
    priorities: null,
    plan: null,
    hiredQuoteId: null,
    verifications: {},
  };
}

export const FACTORS: { key: FactorKey; label: string; question: string }[] = [
  { key: "price", label: "Price", question: "Getting the lowest true cost" },
  { key: "scope", label: "Scope coverage", question: "Everything I need is included in writing" },
  { key: "credentials", label: "License & record", question: "Licensed, insured, no lawsuit history" },
  { key: "reputation", label: "Reviews & experience", question: "Strong reviews and years in business" },
  { key: "timeline", label: "Timeline", question: "Finishing soonest" },
  { key: "warranty", label: "Warranty", question: "Long warranty on labor and materials" },
  { key: "payment", label: "Payment terms", question: "Small deposit, pay as work is done" },
  { key: "communication", label: "The rep", question: "The person who quoted was clear and trustworthy" },
];

export const PRIORITY_LEVELS = [
  { value: 0, label: "Doesn't matter" },
  { value: 2, label: "Somewhat" },
  { value: 4, label: "Important" },
  { value: 5, label: "Must have" },
];

export const DEFAULT_PRIORITIES: Priorities = {
  price: 4,
  scope: 4,
  credentials: 5,
  reputation: 4,
  timeline: 2,
  warranty: 4,
  payment: 2,
  communication: 2,
};

export function quoteLabel(q: Quote, index: number): string {
  return q.contractor.businessName.trim() || `Quote ${index + 1}`;
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
