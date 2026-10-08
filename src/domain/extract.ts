import type { Trade } from "./trades";
import type { LineItem, Quote, ScopeStatus } from "./types";

/**
 * Rule-based reader for quote text (pasted, or pulled out of a PDF). It is the
 * fallback when AI extraction isn't configured, so it aims to be right about
 * what it fills in and leave the rest for the user, not to guess.
 */
export type ExtractedQuote = Partial<Omit<Quote, "contractor" | "agent">> & {
  contractor?: Partial<Quote["contractor"]>;
};

const MONEY = /\$\s?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)/g;

function parseMoney(s: string): number {
  return Number(s.replace(/[$,\s]/g, ""));
}

function moneyIn(line: string): number[] {
  return [...line.matchAll(MONEY)].map((m) => parseMoney(m[1]));
}

const EXCLUSION_WORDS = /(not included|excluded|exclusion|by owner|by others|not part of|additional charge|extra cost|not covered)/i;
const NOT_LINE_ITEM = /(total|subtotal|tax|deposit|down payment|balance|due|payment|discount|valid|warranty)/i;
const HEADER_WORDS = /^(estimate|quote|proposal|invoice|bid|date|to:|prepared for|customer|project)\b/i;
const BUSINESS_HINT = /\b(llc|inc|co\.?|corp|company|roofing|plumbing|electric|hvac|construction|contracting|builders|remodel|services|painting|solar|landscap|exteriors|homes)\b/i;

export function extractFromText(text: string, trade: Trade): ExtractedQuote {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);
  const out: ExtractedQuote = { contractor: {}, rawText: text };

  // Business name: first early line that looks like a company.
  const nameLine =
    nonEmpty.slice(0, 6).find((l) => BUSINESS_HINT.test(l) && !HEADER_WORDS.test(l) && !/\$\s?\d/.test(l) && l.length < 60) ??
    nonEmpty.find((l) => !HEADER_WORDS.test(l) && /[a-z]/i.test(l) && l.length < 60 && !/@|\d{3}.*\d{4}/.test(l));
  if (nameLine) out.contractor!.businessName = nameLine.replace(/^(from|company)\s*:\s*/i, "");

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (email) out.contractor!.email = email[0];
  const phone = text.match(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/);
  if (phone) out.contractor!.phone = phone[0];
  const site = text.match(/\b(?:https?:\/\/)?(?:www\.)[\w-]+\.[a-z]{2,}(?:\/\S*)?/i);
  if (site) out.contractor!.website = site[0];
  const lic = text.match(/\b(?:license|lic\.?|cslb|roc|contractor)\s*(?:#|no\.?|number)?\s*[:#-]?\s*([A-Z]{0,4}[-\s]?\d[\dA-Z-]{3,})/i);
  if (lic) out.contractor!.licenseNumber = lic[1].replace(/\s/g, "");
  const rep = text.match(/(?:sales ?rep|estimator|representative|prepared by|consultant)\s*[:-]\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i);
  if (rep) out.contractor!.agentName = rep[1];
  const years = text.match(/(\d{1,2})\+?\s*years?\s+(?:in business|of experience|serving)/i);
  if (years) out.contractor!.yearsInBusiness = Number(years[1]);
  if (/(fully insured|licensed\s*(?:&|and)\s*insured|insured\s*(?:&|and)\s*bonded|liability insurance)/i.test(text)) out.contractor!.insured = "yes";
  const reviews = text.match(/(\d(?:\.\d)?)\s*(?:stars?|★|\/\s*5)[^\n\d]{0,20}(\d[\d,]*)\s*reviews/i);
  if (reviews) {
    out.contractor!.reviewRating = Number(reviews[1]);
    out.contractor!.reviewCount = Number(reviews[2].replace(/,/g, ""));
  }

  // Total: largest amount on a "total"-ish line, otherwise the largest amount anywhere.
  const totalLines = lines.filter((l) => /(grand total|total price|contract price|total investment|project total|\btotal\b)/i.test(l) && !/subtotal/i.test(l));
  const totalCandidates = totalLines.flatMap(moneyIn);
  const all = lines.flatMap(moneyIn);
  if (totalCandidates.length) out.total = Math.max(...totalCandidates);
  else if (all.length) out.total = Math.max(...all);

  const items: LineItem[] = [];
  for (const l of lines) {
    const amounts = moneyIn(l);
    if (amounts.length !== 1 || NOT_LINE_ITEM.test(l)) continue;
    const description = l.replace(MONEY, "").replace(/[.\-–:\s]+$/g, "").replace(/\.{2,}/g, " ").trim();
    if (description.length >= 3) items.push({ description, amount: amounts[0] });
  }
  if (items.length) out.lineItems = items;

  const dep = text.match(/(\d{1,3})\s*%\s*(?:deposit|down|due (?:at|upon) (?:signing|contract)|up\s?front)/i) ?? text.match(/(?:deposit|down payment)\s*(?:of)?\s*[:-]?\s*(\d{1,3})\s*%/i);
  if (dep) out.depositPercent = Number(dep[1]);
  else {
    const depAmt = lines.find((l) => /(deposit|down payment)/i.test(l) && moneyIn(l).length);
    if (depAmt && out.total) out.depositPercent = Math.round((moneyIn(depAmt)[0] / out.total) * 100);
  }
  if (/cash only/i.test(text)) out.cashOnly = true;

  const labor = text.match(/(\d{1,2}|lifetime)[\s-]*(?:year|yr)?s?[\s-]*(?:labor|workmanship|installation)\s+warranty/i) ?? text.match(/(?:labor|workmanship)\s+warranty\s*[:-]?\s*(\d{1,2}|lifetime)/i);
  if (labor) out.warrantyLaborYears = /lifetime/i.test(labor[1]) ? 25 : Number(labor[1]);
  const mat = text.match(/(\d{1,2}|lifetime)[\s-]*(?:year|yr)?s?[\s-]*(?:manufacturer|material|materials|shingle|equipment|parts|product)s?\s+warranty/i) ?? text.match(/(?:manufacturer|materials?|parts|equipment)\s+warranty\s*[:-]?\s*(\d{1,2}|lifetime)/i);
  if (mat) out.warrantyMaterialsYears = /lifetime/i.test(mat[1]) ? 25 : Number(mat[1]);

  const timeline = text.match(/(?:complet(?:e|ed|ion)|timeline|duration|takes?|within|finish(?:ed)?)[^\n.]{0,25}?(\d{1,3})(?:\s*-\s*(\d{1,3}))?\s*(business\s+|working\s+)?(day|week)s?/i);
  if (timeline) {
    const n = Number(timeline[2] ?? timeline[1]);
    out.timelineDays = /week/i.test(timeline[4]) ? n * 7 : n;
  }
  const valid = text.match(/valid\s+(?:until|through|thru)\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (valid) {
    const y = valid[3].length === 2 ? `20${valid[3]}` : valid[3];
    out.validUntil = `${y}-${valid[1].padStart(2, "0")}-${valid[2].padStart(2, "0")}`;
  }

  out.scope = detectScope(lines, trade);
  return out;
}

export function detectScope(lines: string[], trade: Trade): Record<string, ScopeStatus> {
  const scope: Record<string, ScopeStatus> = {};
  // Lines under an "Exclusions" / "Not included" header count as excluded until a blank line.
  const excludedLines = new Set<number>();
  let inExclusions = false;
  lines.forEach((l, i) => {
    if (/^(exclusions?|not included|excludes|what's not included)\s*:?\s*$/i.test(l)) {
      inExclusions = true;
      return;
    }
    if (!l) inExclusions = false;
    if (inExclusions || EXCLUSION_WORDS.test(l)) excludedLines.add(i);
  });
  for (const item of trade.scope) {
    let status: ScopeStatus = "unclear";
    lines.forEach((l, i) => {
      const lower = l.toLowerCase();
      if (!item.keywords.some((k) => lower.includes(k))) return;
      if (excludedLines.has(i)) status = "excluded";
      else if (status !== "excluded") status = "included";
    });
    scope[item.id] = status;
  }
  return scope;
}

/** Merge extracted fields into a quote without overwriting what the user already typed. */
export function mergeExtracted(q: Quote, x: ExtractedQuote): Quote {
  const contractor = { ...q.contractor };
  for (const [k, v] of Object.entries(x.contractor ?? {})) {
    const key = k as keyof Quote["contractor"];
    const current = contractor[key];
    if (v == null || v === "") continue;
    if (current == null || current === "" || (key === "insured" && current === "unknown")) {
      (contractor as Record<string, unknown>)[key] = v;
    }
  }
  const merged: Quote = { ...q, contractor };
  const fields = ["total", "timelineDays", "warrantyLaborYears", "warrantyMaterialsYears", "depositPercent", "validUntil", "rawText"] as const;
  for (const f of fields) {
    const v = x[f];
    if (v != null && v !== "" && (merged[f] == null || merged[f] === "")) (merged as unknown as Record<string, unknown>)[f] = v;
  }
  if (x.cashOnly) merged.cashOnly = true;
  if (x.lineItems?.length && !q.lineItems.length) merged.lineItems = x.lineItems;
  if (x.scope) {
    const scope = { ...q.scope };
    for (const [id, s] of Object.entries(x.scope)) if (!scope[id] || scope[id] === "unclear") scope[id] = s;
    merged.scope = scope;
  }
  if (x.source) merged.source = x.source;
  return merged;
}
