import { useState } from "react";
import type { Project, Quote } from "../domain/types";
import { getTrade } from "../domain/trades";
import { emptyQuote, formatMoney, quoteLabel } from "../domain/quote";
import { extractFromText, mergeExtracted } from "../domain/extract";
import { SAMPLE_QUOTES } from "../domain/samples";
import { FREE_MAX_QUOTES } from "../domain/plans";
import { navigate } from "../lib/router";
import { QuoteEditor } from "../components/QuoteEditor";
import { ConfirmDialog } from "../components/Dialog";

interface Props {
  project: Project;
  onChange: (p: Project) => void;
}

function completeness(q: Quote, scopeCount: number): number {
  const checks = [
    q.total != null,
    Boolean(q.contractor.licenseNumber),
    q.contractor.insured !== "unknown",
    q.timelineDays != null,
    q.warrantyLaborYears != null || q.warrantyMaterialsYears != null,
    q.depositPercent != null,
    q.contractor.reviewRating != null,
    q.agent.professionalism != null || q.agent.clarity != null,
  ];
  const scopeKnown = Object.values(q.scope).filter((s) => s !== "unclear").length / Math.max(1, scopeCount);
  return Math.round(((checks.filter(Boolean).length + scopeKnown * 2) / (checks.length + 2)) * 100);
}

export function QuotesStep({ project, onChange }: Props) {
  const trade = getTrade(project.tradeId);
  const [editing, setEditing] = useState<{ quote: Quote; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Quote | null>(null);
  const full = project.quotes.length >= FREE_MAX_QUOTES;

  const saveQuote = (q: Quote) => {
    const exists = project.quotes.some((x) => x.id === q.id);
    onChange({ ...project, quotes: exists ? project.quotes.map((x) => (x.id === q.id ? q : x)) : [...project.quotes, q] });
    setEditing(null);
  };

  const loadSamples = () => {
    const roofing = getTrade("roofing");
    const quotes = SAMPLE_QUOTES.map((s) => {
      const q = mergeExtracted(emptyQuote(), { ...extractFromText(s.text, roofing), source: "text" });
      return { ...q, agent: { ...s.agent, comment: "" } };
    });
    onChange({ ...project, tradeId: "roofing", state: project.state || "TX", title: project.title || "Roof replacement (sample)", quotes });
  };

  return (
    <section className="panel" aria-labelledby="quotes-title">
      <div className="panel-head">
        <div>
          <h1 id="quotes-title">Your quotes</h1>
          <p className="muted">
            Add every quote you got for this {trade.label.toLowerCase()} job. Three is a good number; the more detail, the sharper the comparison.
          </p>
        </div>
      </div>

      {project.quotes.length === 0 ? (
        <div className="empty-state card">
          <h2>No quotes yet</h2>
          <p>Upload a PDF, paste an email, or type in the key numbers. You can also see how it works with three sample roofing quotes.</p>
          <div className="actions-inline">
            <button className="btn btn-primary" onClick={() => setEditing({ quote: emptyQuote(), isNew: true })}>Add a quote</button>
            <button className="btn btn-secondary" onClick={loadSamples}>Try with sample quotes</button>
          </div>
        </div>
      ) : (
        <>
          <ul className="quote-list">
            {project.quotes.map((q, i) => {
              const pct = completeness(q, trade.scope.length);
              const name = quoteLabel(q, i);
              return (
                <li key={q.id} className="card quote-card">
                  <div className="quote-card-main">
                    <h2 className="quote-name">{name}</h2>
                    <p className="quote-total">{formatMoney(q.total)}</p>
                    <div className="meter" aria-label={`${pct}% of details filled in`}>
                      <div className="meter-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="hint">
                      {pct >= 80 ? "Detailed enough for a sharp comparison" : pct >= 50 ? "Good. More detail makes the comparison sharper" : "Add more details for a fair comparison"}
                    </p>
                  </div>
                  <div className="quote-card-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ quote: q, isNew: false })} aria-label={`Edit ${name}`}>
                      Edit
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDeleting(q)} aria-label={`Remove ${name}`}>
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="actions-inline">
            <button className="btn btn-secondary" disabled={full} onClick={() => setEditing({ quote: emptyQuote(), isNew: true })}>
              Add another quote
            </button>
            {full && <span className="hint">9 quotes is the most we compare at once.</span>}
          </div>
          {project.quotes.length === 1 && <p className="notice notice-warn">One quote can be checked, but you get the most from comparing two or more.</p>}
        </>
      )}

      <div className="actions">
        <button
          className="btn btn-primary btn-lg"
          disabled={project.quotes.length === 0}
          onClick={() => navigate({ name: "step", projectId: project.id, step: "priorities" })}
        >
          Continue
        </button>
        {project.quotes.length === 0 && <span className="hint">Add at least one quote to continue.</span>}
      </div>

      {editing && (
        <QuoteEditor
          key={editing.quote.id}
          open
          initial={editing.quote}
          isNew={editing.isNew}
          trade={trade}
          onSave={saveQuote}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting != null}
        title={`Remove ${deleting ? quoteLabel(deleting, project.quotes.indexOf(deleting)) : "quote"}?`}
        body="This quote and anything you entered for it will be removed from the comparison."
        confirmLabel="Remove quote"
        danger
        onConfirm={() => {
          if (deleting) onChange({ ...project, quotes: project.quotes.filter((q) => q.id !== deleting.id) });
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
