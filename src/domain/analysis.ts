import { FACTORS, DEFAULT_PRIORITIES, formatMoney, quoteLabel } from "./quote";
import { getPlan } from "./plans";
import { getTrade, type ScopeItem, type Trade } from "./trades";
import type { FactorKey, Flag, PlanId, Priorities, Project, Quote } from "./types";
import type { VerificationReport } from "./verification";

export interface FactorResult {
  score: number | null; // 0-100, null when there is nothing to judge
  note: string;
}

export interface QuoteAnalysis {
  quoteId: string;
  name: string;
  total: number | null;
  missingScopeCost: number;
  effectivePrice: number | null;
  missingItems: ScopeItem[];
  unclearItems: ScopeItem[];
  factors: Record<FactorKey, FactorResult>;
  score: number;
  flags: Flag[];
  strengths: string[];
  weaknesses: string[];
  questions: string[];
  notRecommended: boolean;
}

export interface Analysis {
  quotes: QuoteAnalysis[];
  ranking: string[];
  recommendedId: string | null;
  bestValueId: string | null;
  cheapestId: string | null;
  medianTotal: number | null;
  headline: string;
  reasoning: string[];
}

export interface AnalyzeOptions {
  verifications?: Record<string, VerificationReport | undefined>;
  plan?: PlanId | null;
  today?: Date;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function scopeGaps(q: Quote, trade: Trade) {
  const missing: ScopeItem[] = [];
  const unclear: ScopeItem[] = [];
  let included = 0;
  for (const item of trade.scope) {
    const status = q.scope[item.id] ?? "unclear";
    if (status === "included") included++;
    else if (status === "excluded") missing.push(item);
    else unclear.push(item);
  }
  return { missing, unclear, included };
}

function warrantyScore(q: Quote, trade: Trade): FactorResult {
  const labor = q.warrantyLaborYears;
  const mat = q.warrantyMaterialsYears;
  if (labor == null && mat == null) return { score: 10, note: "No warranty stated in writing" };
  const typical = Math.max(1, trade.typicalWarrantyYears);
  const l = labor == null ? 0 : Math.min(1, labor / typical);
  const m = mat == null ? 0 : Math.min(1, mat / typical);
  const parts = [labor != null ? `${labor} yr labor` : "no labor warranty", mat != null ? `${mat} yr materials` : "materials not stated"];
  return { score: Math.round(clamp((0.6 * l + 0.4 * m) * 100)), note: parts.join(", ") };
}

function paymentScore(q: Quote): FactorResult {
  const d = q.depositPercent;
  let score: number;
  let note: string;
  if (d == null) {
    score = 50;
    note = "Deposit not stated";
  } else {
    score = d <= 10 ? 100 : d <= 25 ? 80 : d <= 33 ? 65 : d <= 50 ? 35 : 0;
    note = `${d}% deposit`;
  }
  if (q.cashOnly) {
    score -= 40;
    note += ", cash only";
  }
  return { score: clamp(score), note };
}

function communicationScore(q: Quote): FactorResult {
  const vals = [q.agent.professionalism, q.agent.clarity, q.agent.responsiveness].filter((v): v is number => v != null);
  if (vals.length === 0 && !q.agent.pressure) return { score: null, note: "You haven't rated the rep" };
  let score = vals.length ? ((vals.reduce((a, b) => a + b, 0) / vals.length - 1) / 4) * 100 : 60;
  if (q.agent.pressure) score -= 25;
  const who = q.contractor.agentName.trim() || "The rep";
  return { score: Math.round(clamp(score)), note: q.agent.pressure ? `${who} used pressure tactics` : `${who}: ${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)}/5` };
}

function reputationScore(q: Quote, v?: VerificationReport): FactorResult {
  const { reviewRating: r, reviewCount: n } = q.contractor;
  const years = v?.business?.yearsRegistered ?? q.contractor.yearsInBusiness;
  if (r == null && years == null) return { score: null, note: "No reviews or business age given" };
  const parts: string[] = [];
  let ratingPart = 50;
  if (r != null) {
    // Bayesian average: a 5.0 from 3 reviews should not beat a 4.7 from 400.
    const count = n ?? 0;
    const prior = 3.5;
    const weight = 15;
    const adjusted = (prior * weight + r * count) / (weight + count);
    ratingPart = ((adjusted - 1) / 4) * 100;
    parts.push(`${r.toFixed(1)}★ from ${count} review${count === 1 ? "" : "s"}`);
  }
  const yearsPart = years == null ? 50 : Math.min(years / 10, 1) * 100;
  if (years != null) parts.push(`${years} yr in business`);
  let score = 0.75 * ratingPart + 0.25 * yearsPart;
  const complaints = v?.business?.complaints ?? 0;
  if (complaints >= 3) {
    score -= 15;
    parts.push(`${complaints} complaints on file`);
  }
  return { score: Math.round(clamp(score)), note: parts.join(", ") };
}

function credentialsScore(q: Quote, trade: Trade, v?: VerificationReport): FactorResult {
  const parts: string[] = [];
  let score: number;
  const lic = v?.license;
  if (lic && (lic.status === "unsupported" || lic.status === "unavailable")) {
    score = 65;
    parts.push(lic.status === "unsupported" ? `License given, can't verify in ${lic.board.split(" ")[0]} yet` : "License given, lookup unavailable");
  } else if (lic) {
    score = lic.status === "active" ? 100 : lic.status === "not_provided" ? (trade.licenseUsuallyRequired ? 15 : 60) : 0;
    if (lic.status === "active" && lic.nameMatch === false) score = 25;
    parts.push(
      lic.status === "active"
        ? lic.source === "live"
          ? "License verified active in state records"
          : "License verified active"
        : lic.status === "not_provided"
          ? "No license number given"
          : `License ${lic.status.replace("_", " ")}`,
    );
    if (lic.status === "active" && lic.nameMatch === false) parts.push("name doesn't match the license");
  } else if (q.contractor.licenseNumber.trim()) {
    score = 65;
    parts.push("License number given, not verified");
  } else {
    score = trade.licenseUsuallyRequired ? 20 : 60;
    parts.push("No license number given");
  }
  if (q.contractor.insured === "no") {
    score -= 40;
    parts.push("not insured");
  } else if (q.contractor.insured === "unknown") {
    score -= 10;
    parts.push("insurance unconfirmed");
  } else parts.push("insured");
  for (const c of v?.courtRecords ?? []) {
    if (c.role !== "defendant") continue;
    score -= c.outcome === "judgment against" ? 30 : c.outcome === "open" ? 15 : c.outcome === "settled" ? 10 : 0;
  }
  const suits = (v?.courtRecords ?? []).filter((c) => c.role === "defendant").length;
  if (suits) parts.push(`${suits} lawsuit${suits > 1 ? "s" : ""} as defendant`);
  if (v?.business?.entityStatus === "not_found") {
    score -= 30;
    parts.push("business registration not found");
  }
  return { score: Math.round(clamp(score)), note: parts.join(", ") };
}

function buildFlags(
  q: Quote,
  trade: Trade,
  medianOthers: number | null,
  gaps: { missing: ScopeItem[]; unclear: ScopeItem[] },
  v: VerificationReport | undefined,
  planId: PlanId | null,
  today: Date,
): Flag[] {
  const flags: Flag[] = [];
  const plan = getPlan(planId);
  const lic = v?.license;

  if (lic && (lic.status === "expired" || lic.status === "suspended" || lic.status === "not_found")) {
    flags.push({
      severity: "critical",
      code: `license_${lic.status}`,
      title: lic.status === "not_found" ? "License number not found" : `License ${lic.status}`,
      detail: `The ${lic.board} has no active license for #${lic.number}. Hiring an unlicensed contractor can void permits and insurance claims, and leaves you little legal recourse.`,
    });
  }
  if (lic?.status === "active" && lic.nameMatch === false) {
    flags.push({
      severity: "critical",
      code: "license_name_mismatch",
      title: "License belongs to a different name",
      detail: `License #${lic.number} is registered to "${lic.holderName}", not "${q.contractor.businessName}". Ask them to explain, and don't pay anything until it's cleared up.`,
    });
  }
  if (lic?.status === "active" && lic.source === "live") {
    const exp = (r: { expires: string | null } | null | undefined) => r?.expires != null && new Date(r.expires + "T23:59:59") < today;
    if (lic.bond === null || exp(lic.bond)) {
      flags.push({ severity: "warning", code: "bond_issue", title: lic.bond ? "Contractor bond has expired" : "No contractor bond on file", detail: "The bond is what you can claim against if the work is abandoned or defective. Ask for proof of a current bond." });
    }
    if (lic.insurance === null || exp(lic.insurance)) {
      flags.push({ severity: "warning", code: "insurance_issue", title: lic.insurance ? "Liability insurance on file has expired" : "No liability insurance on file", detail: "The state's records show no current liability insurance. Ask for a certificate sent directly from their insurer." });
    }
  }
  if (lic && (lic.status === "unsupported" || lic.status === "unavailable")) {
    flags.push({
      severity: "info",
      code: lic.status === "unsupported" ? "license_unsupported" : "license_unavailable",
      title: lic.status === "unsupported" ? "We can't verify licenses in this state yet" : "License lookup unavailable right now",
      detail: `Check license #${lic.number} yourself on the official site: ${lic.lookupUrl ?? "your state's contractor licensing board"}. Look for an active status, the right classification, and the same business name.`,
    });
  }
  if (!q.contractor.licenseNumber.trim() && trade.licenseUsuallyRequired) {
    flags.push({
      severity: lic ? "critical" : "warning",
      code: "license_missing",
      title: "No license number on the quote",
      detail: `${trade.label} work usually requires a state license. Ask for the number and verify it before signing.`,
    });
  }
  if (plan && !plan.licenseCheck && q.contractor.licenseNumber.trim()) {
    flags.push({
      severity: "info",
      code: "license_unchecked",
      title: "License not verified on this plan",
      detail: "The Essential plan doesn't check licenses. Upgrade to Verified, or look the number up on your state board's website.",
    });
  }
  if (v?.business?.entityStatus === "not_found") {
    flags.push({
      severity: "critical",
      code: "business_not_found",
      title: "Business not registered",
      detail: "No active business registration was found under this name. It may be operating under another name, or not legally at all.",
    });
  }
  for (const c of v?.courtRecords ?? []) {
    if (c.role !== "defendant") continue;
    const serious = c.outcome === "judgment against" || (c.outcome === "open" && c.caseType === "Consumer fraud complaint");
    flags.push({
      severity: serious ? "critical" : "warning",
      code: "lawsuit",
      title: `Lawsuit: ${c.caseType} (${c.outcome})`,
      detail: `Filed ${c.filed}. ${c.summary}`,
    });
  }
  if ((v?.business?.complaints ?? 0) >= 3) {
    flags.push({ severity: "warning", code: "complaints", title: `${v!.business!.complaints} consumer complaints`, detail: "Read them before hiring and ask the contractor how they were resolved." });
  }
  if (q.contractor.insured === "no") {
    flags.push({ severity: "critical", code: "uninsured", title: "Not insured", detail: "If a worker is hurt on your property or your home is damaged, you may be liable." });
  } else if (q.contractor.insured === "unknown") {
    flags.push({ severity: "warning", code: "insurance_unknown", title: "Insurance not confirmed", detail: "Ask for a certificate of insurance (liability and workers' comp) sent directly from their insurer." });
  }
  if (q.depositPercent != null && q.depositPercent > 50) {
    flags.push({ severity: "critical", code: "deposit_high", title: `${q.depositPercent}% deposit up front`, detail: "Large upfront deposits are the most common way homeowners lose money. Several states cap them (California: 10% or $1,000, whichever is less)." });
  } else if (q.depositPercent != null && q.depositPercent > 33) {
    flags.push({ severity: "warning", code: "deposit_high", title: `${q.depositPercent}% deposit up front`, detail: "Ask to tie payments to completed milestones instead. Several states cap deposits (California: 10% or $1,000)." });
  }
  if (q.cashOnly) flags.push({ severity: "warning", code: "cash_only", title: "Cash only", detail: "Cash leaves no paper trail if something goes wrong. Pay by check or card." });
  if (q.total != null && medianOthers != null && medianOthers > 0) {
    const ratio = q.total / medianOthers;
    if (ratio < 0.75) {
      flags.push({ severity: "warning", code: "lowball", title: `${Math.round((1 - ratio) * 100)}% below the other quotes`, detail: "Very low bids often leave things out and make it back through change orders. Confirm the scope line by line." });
    } else if (ratio > 1.4) {
      flags.push({ severity: "info", code: "high_price", title: `${Math.round((ratio - 1) * 100)}% above the other quotes`, detail: "Ask what justifies the premium: materials, warranty, crew size, or just margin." });
    }
  }
  if (gaps.missing.length) {
    flags.push({ severity: "warning", code: "scope_missing", title: `Leaves out ${gaps.missing.length} item${gaps.missing.length > 1 ? "s" : ""}`, detail: `Not included: ${gaps.missing.map((i) => i.label.toLowerCase()).join(", ")}. You'll pay for these separately.` });
  }
  if (gaps.unclear.length) {
    flags.push({ severity: "info", code: "scope_unclear", title: `${gaps.unclear.length} item${gaps.unclear.length > 1 ? "s" : ""} not addressed`, detail: `The quote doesn't say whether it covers: ${gaps.unclear.map((i) => i.label.toLowerCase()).join(", ")}.` });
  }
  if (q.warrantyLaborYears == null && q.warrantyMaterialsYears == null) {
    flags.push({ severity: "warning", code: "no_warranty", title: "No written warranty", detail: "A verbal warranty is worth very little. Get labor and materials coverage in the contract." });
  }
  if (q.timelineDays == null) flags.push({ severity: "info", code: "no_timeline", title: "No timeline", detail: "Ask for a start date and a completion date in writing." });
  if (q.validUntil && new Date(q.validUntil + "T23:59:59") < today) {
    flags.push({ severity: "info", code: "expired_quote", title: "Quote has expired", detail: `Valid until ${q.validUntil}. The price may change.` });
  }
  if (q.agent.pressure) flags.push({ severity: "warning", code: "pressure", title: "Pressure tactics", detail: "\"Today only\" pricing is a sales tactic. A good contractor will honor a quote for at least a couple of weeks." });
  const order = { critical: 0, warning: 1, info: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}

function questionsFor(q: Quote, gaps: { missing: ScopeItem[]; unclear: ScopeItem[] }, flags: Flag[]): string[] {
  const qs: string[] = [];
  for (const item of gaps.missing) qs.push(`Your quote excludes ${item.label.toLowerCase()}. Who handles it, and what will it cost?`);
  for (const item of gaps.unclear.slice(0, 4)) qs.push(`Is ${item.label.toLowerCase()} included in your price?`);
  if (!q.contractor.licenseNumber.trim()) qs.push("What is your state license number?");
  if (q.contractor.insured !== "yes") qs.push("Can your insurer send me a certificate of liability and workers' comp insurance?");
  if (q.warrantyLaborYears == null) qs.push("What warranty do you give on your labor, and can you put it in the contract?");
  if (q.timelineDays == null) qs.push("When can you start, and how many working days will it take?");
  if (q.depositPercent != null && q.depositPercent > 25) qs.push(`Can we lower the ${q.depositPercent}% deposit and pay at milestones instead?`);
  if (flags.some((f) => f.code === "lawsuit")) qs.push("I saw past lawsuits against your company. What happened, and what changed since?");
  if (flags.some((f) => f.code === "lowball")) qs.push("Your price is well below the others. What are you doing differently, and what could add change orders?");
  qs.push("How do you handle change orders? Will every change be priced in writing before work starts?");
  return qs;
}

export function analyzeProject(project: Project, opts: AnalyzeOptions = {}): Analysis {
  const trade = getTrade(project.tradeId);
  const priorities: Priorities = project.priorities ?? DEFAULT_PRIORITIES;
  const today = opts.today ?? new Date();
  const plan = opts.plan ?? project.plan;
  const quotes = project.quotes;

  const totals = quotes.map((q) => q.total).filter((t): t is number => t != null && t > 0);
  const medianTotal = median(totals);
  const reference = medianTotal ?? 0;

  const partial = quotes.map((q, i) => {
    const gaps = scopeGaps(q, trade);
    const missingScopeCost = Math.round(
      gaps.missing.reduce((s, it) => s + it.share * reference, 0) + gaps.unclear.reduce((s, it) => s + 0.25 * it.share * reference, 0),
    );
    const effectivePrice = q.total != null && q.total > 0 ? q.total + missingScopeCost : null;
    const othersTotals = quotes.filter((o) => o.id !== q.id).map((o) => o.total).filter((t): t is number => t != null && t > 0);
    return { q, i, gaps, missingScopeCost, effectivePrice, medianOthers: median(othersTotals) };
  });

  const effPrices = partial.map((p) => p.effectivePrice).filter((x): x is number => x != null);
  const minEff = effPrices.length ? Math.min(...effPrices) : null;
  const days = quotes.map((q) => q.timelineDays).filter((d): d is number => d != null && d > 0);
  const minDays = days.length ? Math.min(...days) : null;

  const analyses: QuoteAnalysis[] = partial.map(({ q, i, gaps, missingScopeCost, effectivePrice, medianOthers }) => {
    const v = opts.verifications?.[q.id];
    const n = trade.scope.length;
    const factors: Record<FactorKey, FactorResult> = {
      price:
        effectivePrice != null && minEff != null
          ? {
              score: Math.round((minEff / effectivePrice) * 100),
              note: missingScopeCost > 0 ? `${formatMoney(q.total)} + ~${formatMoney(missingScopeCost)} for gaps` : formatMoney(q.total),
            }
          : { score: null, note: "No total price" },
      scope: {
        score: Math.round(((n - gaps.missing.length - gaps.unclear.length + gaps.unclear.length * 0.5) / n) * 100),
        note: `${n - gaps.missing.length - gaps.unclear.length} of ${n} items confirmed`,
      },
      credentials: credentialsScore(q, trade, v),
      reputation: reputationScore(q, v),
      timeline:
        q.timelineDays != null && q.timelineDays > 0 && minDays != null
          ? { score: Math.round((minDays / q.timelineDays) * 100), note: `${q.timelineDays} days` }
          : { score: null, note: "No timeline given" },
      warranty: warrantyScore(q, trade),
      payment: paymentScore(q),
      communication: communicationScore(q),
    };

    let weighted = 0;
    let weightSum = 0;
    for (const { key } of FACTORS) {
      const w = priorities[key] ?? 0;
      const s = factors[key].score;
      if (w <= 0 || s == null) continue;
      weighted += w * s;
      weightSum += w;
    }
    let score = weightSum ? weighted / weightSum : 0;

    const flags = buildFlags(q, trade, medianOthers, gaps, v, plan ?? null, today);
    const notRecommended = flags.some((f) => f.severity === "critical");
    if (notRecommended) score *= 0.6;

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    for (const { key, label } of FACTORS) {
      const s = factors[key].score;
      if (s == null) continue;
      if (s >= 85) strengths.push(`${label}: ${factors[key].note}`);
      else if (s <= 40) weaknesses.push(`${label}: ${factors[key].note}`);
    }

    return {
      quoteId: q.id,
      name: quoteLabel(q, i),
      total: q.total,
      missingScopeCost,
      effectivePrice,
      missingItems: gaps.missing,
      unclearItems: gaps.unclear,
      factors,
      score: Math.round(score),
      flags,
      strengths,
      weaknesses,
      questions: questionsFor(q, gaps, flags),
      notRecommended,
    };
  });

  const ranked = [...analyses].sort((a, b) => b.score - a.score);
  const eligible = ranked.filter((a) => !a.notRecommended);
  const recommended = eligible[0] ?? null;
  const priced = analyses.filter((a) => a.total != null && a.total > 0);
  const cheapest = priced.length ? priced.reduce((a, b) => (a.total! <= b.total! ? a : b)) : null;
  // Best value: highest quality score per dollar among the ones you could safely hire.
  const valueCandidates = eligible.filter((a) => a.effectivePrice != null);
  const bestValue = valueCandidates.length
    ? valueCandidates.reduce((a, b) => (scoreExPrice(a) / a.effectivePrice! >= scoreExPrice(b) / b.effectivePrice! ? a : b))
    : null;

  const { headline, reasoning } = explain(recommended, cheapest, bestValue, analyses, priorities);

  return {
    quotes: analyses,
    ranking: ranked.map((a) => a.quoteId),
    recommendedId: recommended?.quoteId ?? null,
    bestValueId: bestValue?.quoteId ?? null,
    cheapestId: cheapest?.quoteId ?? null,
    medianTotal,
    headline,
    reasoning,
  };
}

function scoreExPrice(a: QuoteAnalysis): number {
  const vals = (Object.keys(a.factors) as FactorKey[])
    .filter((k) => k !== "price")
    .map((k) => a.factors[k].score)
    .filter((s): s is number => s != null);
  return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0;
}

function explain(
  rec: QuoteAnalysis | null,
  cheapest: QuoteAnalysis | null,
  bestValue: QuoteAnalysis | null,
  all: QuoteAnalysis[],
  priorities: Priorities,
): { headline: string; reasoning: string[] } {
  if (all.length === 0) return { headline: "Add your quotes to get a recommendation.", reasoning: [] };
  if (!rec) {
    return {
      headline: "None of these quotes is safe to sign as written.",
      reasoning: [
        "Every quote has at least one serious problem (license, insurance, lawsuits, registration or deposit).",
        "Resolve the red flags below, or get another quote from a licensed, insured contractor.",
      ],
    };
  }
  const reasoning: string[] = [];
  const top = FACTORS.filter((f) => priorities[f.key] >= 4 && rec.factors[f.key].score != null)
    .sort((a, b) => (rec.factors[b.key].score ?? 0) - (rec.factors[a.key].score ?? 0))
    .slice(0, 3);
  if (top.length) {
    reasoning.push(`On what you said matters most: ${top.map((f) => `${f.label.toLowerCase()} (${rec.factors[f.key].note})`).join("; ")}.`);
  }
  if (cheapest && cheapest.quoteId !== rec.quoteId && rec.total != null && cheapest.total != null) {
    const diff = rec.total - cheapest.total;
    const effDiff = (rec.effectivePrice ?? 0) - (cheapest.effectivePrice ?? 0);
    if (cheapest.notRecommended) {
      reasoning.push(`${cheapest.name} is ${formatMoney(diff)} cheaper, but it has serious red flags (${cheapest.flags.find((f) => f.severity === "critical")?.title.toLowerCase()}).`);
    } else if (effDiff < diff) {
      reasoning.push(
        `${cheapest.name} looks ${formatMoney(diff)} cheaper, but after pricing in what it leaves out the real gap is ${effDiff <= 0 ? "gone" : formatMoney(effDiff)}.`,
      );
    } else {
      reasoning.push(`It costs ${formatMoney(diff)} more than ${cheapest.name}; the higher score comes from the factors you weighted most.`);
    }
  } else if (cheapest?.quoteId === rec.quoteId) {
    reasoning.push("It's also the lowest price.");
  }
  if (bestValue && bestValue.quoteId !== rec.quoteId) {
    reasoning.push(`If budget is tight, ${bestValue.name} gives the most per dollar among the quotes without red flags.`);
  }
  const unsafe = all.filter((a) => a.notRecommended);
  if (unsafe.length) reasoning.push(`Not recommended: ${unsafe.map((a) => a.name).join(", ")}, because of the red flags below.`);
  if (rec.missingItems.length || rec.unclearItems.length) {
    reasoning.push(`Before you sign, get ${rec.name} to confirm in writing: ${[...rec.missingItems, ...rec.unclearItems].slice(0, 4).map((i) => i.label.toLowerCase()).join(", ")}.`);
  }
  return { headline: `Hire ${rec.name}.`, reasoning };
}
