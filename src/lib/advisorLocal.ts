import type { Analysis, QuoteAnalysis } from "../domain/analysis";
import { formatMoney } from "../domain/quote";

/**
 * The advisor used when the AI service isn't connected. It answers the common
 * questions straight from the analysis, so the chat is never a dead end.
 */
export function localAdvisorAnswer(question: string, analysis: Analysis): string {
  const q = question.toLowerCase();
  const byId = new Map(analysis.quotes.map((a) => [a.quoteId, a]));
  const rec = analysis.recommendedId ? byId.get(analysis.recommendedId) : undefined;
  const mentioned = analysis.quotes.filter((a) => q.includes(a.name.toLowerCase().split(" ")[0]));

  const describe = (a: QuoteAnalysis) => {
    const lines = [`**${a.name}** scores ${a.score}/100 on your priorities.`];
    if (a.strengths.length) lines.push(`Strong on: ${a.strengths.join("; ")}.`);
    if (a.weaknesses.length) lines.push(`Weak on: ${a.weaknesses.join("; ")}.`);
    const serious = a.flags.filter((f) => f.severity !== "info");
    if (serious.length) lines.push(`Watch out: ${serious.map((f) => f.title).join("; ")}.`);
    return lines.join(" ");
  };

  if (mentioned.length >= 2 || /\b(vs|versus|compare|difference)\b/.test(q)) {
    const pair = mentioned.length >= 2 ? mentioned.slice(0, 2) : analysis.quotes.slice(0, 2);
    return pair.map(describe).join("\n\n");
  }
  if (mentioned.length === 1) {
    const a = mentioned[0];
    if (/(ask|question|negotiat)/.test(q)) return `Ask ${a.name}:\n${a.questions.map((x) => `• ${x}`).join("\n")}`;
    return describe(a);
  }
  if (/(negotiat|lower|discount|cheaper|price down)/.test(q) && rec) {
    const cheapest = analysis.cheapestId ? byId.get(analysis.cheapestId) : undefined;
    const tips = [
      cheapest && cheapest.quoteId !== rec.quoteId ? `Show ${rec.name} that ${cheapest.name} quoted ${formatMoney(cheapest.total)} and ask if they can close part of the gap.` : null,
      "Ask for a lower deposit (10% is standard) with payments tied to milestones.",
      rec.missingItems.length ? `Ask them to include ${rec.missingItems.map((i) => i.label.toLowerCase()).join(", ")} at the quoted price.` : null,
      "Ask whether scheduling in their slow season lowers the price.",
    ].filter(Boolean);
    return tips.map((t) => `• ${t}`).join("\n");
  }
  if (/(why|reason|explain)/.test(q)) return [analysis.headline, ...analysis.reasoning].join("\n\n");
  if (/(lawsuit|sued|court|license|insur|risk|safe|red flag|scam)/.test(q)) {
    const lines = analysis.quotes
      .map((a) => {
        const f = a.flags.filter((x) => x.severity === "critical" || x.code === "lawsuit" || x.code.startsWith("license") || x.code.includes("insur"));
        return f.length ? `**${a.name}**: ${f.map((x) => x.title).join("; ")}` : `**${a.name}**: no license, insurance or court problems found.`;
      })
      .join("\n");
    return `${lines}\n\nBefore you sign, confirm the license on your state board's website and get the insurance certificate sent from the insurer.`;
  }
  if (/(ask|question)/.test(q) && rec) return `Ask ${rec.name}:\n${rec.questions.map((x) => `• ${x}`).join("\n")}`;
  if (/(contract|sign|before)/.test(q)) {
    return [
      "Before you sign, make sure the contract has:",
      "• The full scope, line by line, including what's excluded",
      "• Total price and a payment schedule tied to milestones",
      "• Start and completion dates",
      "• Labor and materials warranty in writing",
      "• License number and proof of insurance",
      "• How change orders are priced and approved",
    ].join("\n");
  }
  return [analysis.headline, ...analysis.reasoning].join("\n\n");
}
