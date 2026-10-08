import type { Analysis } from "../domain/analysis";
import { formatMoney } from "../domain/quote";

/** Quoted price plus the estimated cost of what's missing, on one shared scale. */
export function PriceChart({ analysis }: { analysis: Analysis }) {
  const rows = analysis.quotes.filter((a) => a.total != null);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((a) => a.effectivePrice ?? a.total ?? 0));
  return (
    <figure className="price-chart">
      <figcaption>
        <strong>True cost</strong>
        <span className="legend">
          <span className="swatch swatch-quoted" /> Quoted price <span className="swatch swatch-gap" /> Est. cost of what's left out
        </span>
      </figcaption>
      <ul>
        {rows.map((a) => (
          <li key={a.quoteId}>
            <span className="pc-name">{a.name}</span>
            <span className="pc-track" aria-hidden="true">
              <span className="pc-quoted" style={{ width: `${((a.total ?? 0) / max) * 100}%` }} />
              {a.missingScopeCost > 0 && <span className="pc-gap" style={{ width: `${(a.missingScopeCost / max) * 100}%` }} />}
            </span>
            <span className="pc-value">
              {formatMoney(a.effectivePrice)}
              {a.missingScopeCost > 0 && <span className="sr-only"> ({formatMoney(a.total)} quoted plus about {formatMoney(a.missingScopeCost)} for gaps)</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">Gap costs are estimates based on typical job breakdowns, scaled to your quotes. Ask each contractor for the real number.</p>
    </figure>
  );
}
