import type { Analysis } from "../domain/analysis";
import type { Project } from "../domain/types";
import type { Trade } from "../domain/trades";
import { FACTORS, formatMoney } from "../domain/quote";

const SCOPE_MARK = { included: ["✓", "Included", "good"], excluded: ["✕", "Not included", "bad"], unclear: ["?", "Not stated", "muted"] } as const;

export function ComparisonTable({ analysis, project, trade, showScores }: { analysis: Analysis; project: Project; trade: Trade; showScores: boolean }) {
  const quotes = analysis.quotes;
  const byId = new Map(project.quotes.map((q) => [q.id, q]));
  const best = (vals: (number | null)[], higher = true) => {
    const nums = vals.filter((v): v is number => v != null);
    if (!nums.length) return null;
    return higher ? Math.max(...nums) : Math.min(...nums);
  };
  const minTrue = best(quotes.map((a) => a.effectivePrice), false);

  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Side-by-side comparison">
      <table className="compare">
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">Factor</span></th>
            {quotes.map((a) => (
              <th scope="col" key={a.quoteId}>
                {a.name}
                {showScores && a.quoteId === analysis.recommendedId && <span className="badge badge-accent">Top pick</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Quoted price</th>
            {quotes.map((a) => <td key={a.quoteId} className="num">{formatMoney(a.total)}</td>)}
          </tr>
          <tr>
            <th scope="row">True cost (est.)</th>
            {quotes.map((a) => (
              <td key={a.quoteId} className={`num ${a.effectivePrice != null && a.effectivePrice === minTrue ? "best" : ""}`}>
                {formatMoney(a.effectivePrice)}
              </td>
            ))}
          </tr>
          {FACTORS.filter((f) => f.key !== "price").map((f) => {
            const top = best(quotes.map((a) => a.factors[f.key].score));
            return (
              <tr key={f.key}>
                <th scope="row">{f.label}</th>
                {quotes.map((a) => {
                  const r = a.factors[f.key];
                  return (
                    <td key={a.quoteId} className={showScores && r.score != null && r.score === top && quotes.length > 1 ? "best" : ""}>
                      {showScores && r.score != null && <span className="score-chip">{r.score}</span>}
                      {r.note}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className="group-row">
            <th scope="rowgroup" colSpan={quotes.length + 1}>What's included</th>
          </tr>
          {trade.scope.map((item) => (
            <tr key={item.id}>
              <th scope="row" className="sub">{item.label}</th>
              {quotes.map((a) => {
                const status = byId.get(a.quoteId)?.scope[item.id] ?? "unclear";
                const [mark, label, cls] = SCOPE_MARK[status];
                return (
                  <td key={a.quoteId} className={`mark ${cls}`}>
                    <span aria-hidden="true">{mark}</span>
                    <span className="sr-only">{label}</span>
                  </td>
                );
              })}
            </tr>
          ))}
          {showScores && (
            <tr className="total-row">
              <th scope="row">Overall score</th>
              {quotes.map((a) => <td key={a.quoteId} className="num"><strong>{a.score}</strong>/100</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
