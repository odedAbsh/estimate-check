import { useEffect, useMemo, useState } from "react";
import type { Project, Quote } from "../domain/types";
import { analyzeProject, type Analysis, type QuoteAnalysis } from "../domain/analysis";
import { getPlan } from "../domain/plans";
import { getTrade } from "../domain/trades";
import { FACTORS, formatMoney } from "../domain/quote";
import type { VerificationReport } from "../domain/verification";
import { verificationProvider } from "../lib/verify";
import { hashQuery, navigate } from "../lib/router";
import { useApp } from "../lib/AppContext";
import { api } from "../lib/session";
import type { PlanId } from "../domain/types";
import { PlanPicker } from "../components/PlanPicker";
import { FlagList } from "../components/FlagList";
import { VerificationPanel } from "../components/VerificationPanel";
import { ComparisonTable } from "../components/ComparisonTable";
import { PriceChart } from "../components/PriceChart";
import { AdvisorChat } from "../components/AdvisorChat";

interface Props {
  project: Project;
  onChange: (p: Project) => void;
}

function fingerprint(q: Quote, planId: string): string {
  return [q.contractor.businessName.trim().toLowerCase(), q.contractor.licenseNumber.trim(), q.contractor.yearsInBusiness ?? "", planId].join("|");
}

function buildAdvisorContext(project: Project, analysis: Analysis): string {
  const trade = getTrade(project.tradeId);
  return JSON.stringify(
    {
      job: { trade: trade.label, description: project.description, state: project.state },
      priorities: project.priorities,
      backgroundChecks: "Sample data in this prototype; tell the user to confirm with the state board.",
      recommendation: { headline: analysis.headline, reasoning: analysis.reasoning },
      quotes: analysis.quotes.map((a) => ({
        name: a.name,
        score: a.score,
        quotedPrice: a.total,
        estimatedTrueCost: a.effectivePrice,
        notIncluded: a.missingItems.map((i) => i.label),
        notStated: a.unclearItems.map((i) => i.label),
        factors: Object.fromEntries(FACTORS.map((f) => [f.label, a.factors[f.key].note])),
        flags: a.flags.map((f) => `${f.severity}: ${f.title}. ${f.detail}`),
        rep: project.quotes.find((q) => q.id === a.quoteId)?.agent,
      })),
    },
    null,
    1,
  );
}

export function ResultsStep({ project, onChange }: Props) {
  const trade = getTrade(project.tradeId);
  const plan = getPlan(project.plan);
  const { user, payments, requireAccount, flushProject, refreshProject } = useApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [payNote, setPayNote] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Run background checks for any quote that hasn't been checked for the current details and plan.
  const stale = plan ? project.quotes.filter((q) => project.verifications[q.id]?.key !== fingerprint(q, plan.id)) : [];
  const staleKey = stale.map((q) => q.id).join(",");
  useEffect(() => {
    if (!plan || stale.length === 0) return;
    let cancelled = false;
    setChecking(true);
    Promise.all(
      stale.map(async (q) => {
        const report = await verificationProvider.verify(q.contractor, {
          state: project.state,
          tradeLabel: trade.label,
          business: plan.businessCheck,
          license: plan.licenseCheck,
          courtRecords: plan.courtRecords,
          sample: project.sample,
          projectId: project.id,
        });
        return [q.id, { key: fingerprint(q, plan.id), report }] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      onChange({ ...project, verifications: { ...project.verifications, ...Object.fromEntries(entries) } });
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleKey, plan?.id]);

  const verifications = useMemo(() => {
    const out: Record<string, VerificationReport | undefined> = {};
    if (plan) for (const q of project.quotes) out[q.id] = project.verifications[q.id]?.report;
    return out;
  }, [project.quotes, project.verifications, plan]);

  const analysis = useMemo(() => analyzeProject(project, { verifications, plan: project.plan }), [project, verifications]);
  const unlocked = Boolean(plan);
  const ordered = unlocked ? analysis.ranking.map((id) => analysis.quotes.find((a) => a.quoteId === id)!) : analysis.quotes;
  const tooMany = plan && project.quotes.length > plan.maxQuotes;
  const recommended = analysis.quotes.find((a) => a.quoteId === analysis.recommendedId);

  const openPicker = async () => {
    if (!(await requireAccount("Create a free account to unlock this comparison. Your quotes are saved to it, so you can come back from any device."))) return;
    await flushProject(project.id);
    setPickerOpen(true);
  };

  const purchase = async (planId: PlanId): Promise<string | null> => {
    await flushProject(project.id);
    const r = await api<{ url?: string; demo?: boolean; error?: string }>(`/api/projects/${project.id}/checkout`, "POST", { plan: planId });
    if (!r.ok) return r.body.error ?? "We couldn't start the payment. Nothing was charged.";
    if (r.body.url) {
      window.location.assign(r.body.url);
      return null;
    }
    await refreshProject(project.id);
    setPickerOpen(false);
    return null;
  };

  // Coming back from Stripe: confirm the payment directly instead of waiting on the webhook.
  const returnedSession = hashQuery().get("session_id");
  useEffect(() => {
    if (!returnedSession || !user) return;
    let cancelled = false;
    setPayNote({ kind: "ok", text: "Confirming your payment…" });
    (async () => {
      const r = await api<{ paid?: boolean; error?: string }>("/api/billing/confirm", "POST", { sessionId: returnedSession });
      if (cancelled) return;
      if (r.ok && r.body.paid) {
        await refreshProject(project.id);
        setPayNote({ kind: "ok", text: "Payment received. Your comparison is unlocked." });
      } else if (r.ok) {
        setPayNote({ kind: "warn", text: "Your payment is still processing. This page will unlock as soon as it clears; refresh in a minute." });
      } else {
        setPayNote({ kind: "warn", text: r.body.error ?? "We couldn't confirm the payment yet. If you were charged, it will show up shortly." });
      }
      history.replaceState(null, "", `#/p/${project.id}/results`);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedSession, user?.id]);

  const copyQuestions = async (a: QuoteAnalysis) => {
    try {
      await navigator.clipboard.writeText(`Questions for ${a.name}:\n${a.questions.map((q) => `- ${q}`).join("\n")}`);
      setCopied(a.quoteId);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <section className="results" aria-labelledby="results-title">
      <div className="panel-head">
        <div>
          <h1 id="results-title">{project.title || `${trade.label} quotes`}</h1>
          <p className="muted">
            {project.quotes.length} quote{project.quotes.length === 1 ? "" : "s"} · {trade.label}
            {project.state ? ` · ${project.state}` : ""}
            {plan ? ` · ${plan.name} plan` : " · Free preview"}
          </p>
        </div>
        <div className="actions-inline">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate({ name: "step", projectId: project.id, step: "priorities" })}>
            Change priorities
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate({ name: "step", projectId: project.id, step: "quotes" })}>
            Edit quotes
          </button>
        </div>
      </div>

      {payNote && (
        <p role="status" className={`notice notice-${payNote.kind}`}>
          {payNote.text}
        </p>
      )}

      {project.sample && (
        <p className="notice notice-warn">
          This is a sample project. The contractors are made up, so every check here uses sample records. Start a new comparison to check real
          contractors.
        </p>
      )}

      {tooMany && (
        <p className="notice notice-warn">
          Your {plan!.name} plan covers {plan!.maxQuotes} quotes and you have {project.quotes.length}.{" "}
          <button className="link-btn" onClick={openPicker}>Upgrade</button> or remove a quote.
        </p>
      )}

      {unlocked ? (
        <div className={`card verdict ${recommended ? "" : "verdict-none"}`} aria-live="polite">
          <p className="eyebrow">Our recommendation</p>
          <h2 className="verdict-headline">{checking ? "Running background checks…" : analysis.headline}</h2>
          {!checking && (
            <>
              {recommended && (
                <p className="verdict-meta">
                  <span className="score-big">{recommended.score}</span>/100 on your priorities · {formatMoney(recommended.total)} quoted
                </p>
              )}
              <ul className="reasons">
                {analysis.reasoning.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {recommended && (
                <button
                  className={`btn ${project.hiredQuoteId === recommended.quoteId ? "btn-secondary" : "btn-primary"}`}
                  onClick={() => onChange({ ...project, hiredQuoteId: project.hiredQuoteId === recommended.quoteId ? null : recommended.quoteId })}
                >
                  {project.hiredQuoteId === recommended.quoteId ? "Marked as hired ✓" : `I'm hiring ${recommended.name}`}
                </button>
              )}
            </>
          )}
          <p className="demo-note">
            License checks use the state's official records where we have them (Oregon today); other states link you to the official lookup. Lawsuit and
            business records are sample data in this prototype. Always confirm the license and insurance yourself before signing.
          </p>
        </div>
      ) : (
        <div className="card verdict verdict-locked">
          <div className="locked-cta">
            <p className="eyebrow">Our recommendation</p>
            <h2>See who to hire, and who to avoid</h2>
            <p className="muted">
              Unlock the verdict, a license and lawsuit check on every contractor, and the questions to ask before you sign. The comparison
              below is free.
            </p>
            <button className="btn btn-primary btn-lg" onClick={openPicker}>Unlock from $29</button>
          </div>
        </div>
      )}

      <PriceChart analysis={analysis} />

      <h2 className="section-title">{unlocked ? "Ranked for you" : "Each quote at a glance"}</h2>
      <ol className="contractor-list">
        {ordered.map((a, i) => {
          const isRec = a.quoteId === analysis.recommendedId && unlocked;
          return (
            <li key={a.quoteId} className={`card contractor ${isRec ? "contractor-top" : ""} ${a.notRecommended && unlocked ? "contractor-avoid" : ""}`}>
              <header className="contractor-head">
                {unlocked && <span className="rank" aria-label={`Rank ${i + 1}`}>{i + 1}</span>}
                <div className="contractor-title">
                  <h3>{a.name}</h3>
                  <p className="muted">
                    {formatMoney(a.total)} quoted
                    {a.missingScopeCost > 0 && ` · ~${formatMoney(a.effectivePrice)} with what's missing`}
                  </p>
                </div>
                {unlocked && (
                  <div className="score-ring" style={{ ["--p" as string]: a.score }} aria-label={`Score ${a.score} out of 100`}>
                    <span>{a.score}</span>
                  </div>
                )}
                {isRec && <span className="badge badge-accent">Top pick</span>}
                {unlocked && a.quoteId === analysis.bestValueId && !isRec && <span className="badge">Best value</span>}
                {unlocked && a.notRecommended && <span className="badge badge-danger">Not recommended</span>}
              </header>

              {unlocked && (a.strengths.length > 0 || a.weaknesses.length > 0) && (
                <div className="sw">
                  {a.strengths.length > 0 && (
                    <div>
                      <h4>Strengths</h4>
                      <ul className="checks">{a.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
                    </div>
                  )}
                  {a.weaknesses.length > 0 && (
                    <div>
                      <h4>Weak spots</h4>
                      <ul className="crosses">{a.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}

              <h4>Warnings</h4>
              <FlagList flags={a.flags} />

              {unlocked && plan && (
                <>
                  <h4>Background check</h4>
                  <VerificationPanel report={verifications[a.quoteId]} plan={plan} loading={checking && !verifications[a.quoteId]} />
                </>
              )}

              {unlocked ? (
                <details className="questions">
                  <summary>Questions to ask {a.name} ({a.questions.length})</summary>
                  <ul>{a.questions.map((q) => <li key={q}>{q}</li>)}</ul>
                  <button className="btn btn-secondary btn-sm" onClick={() => copyQuestions(a)}>
                    {copied === a.quoteId ? "Copied" : "Copy questions"}
                  </button>
                </details>
              ) : null}
            </li>
          );
        })}
      </ol>

      <h2 className="section-title">Side by side</h2>
      <ComparisonTable analysis={analysis} project={project} trade={trade} showScores={unlocked} />

      {plan?.advisorChat ? (
        <AdvisorChat projectId={project.id} analysis={analysis} context={buildAdvisorContext(project, analysis)} />
      ) : unlocked ? (
        <div className="card upsell">
          <div>
            <h2>Want to talk it through?</h2>
            <p className="muted">
              {plan?.licenseCheck ? "" : "Get license verification and lawsuit records, plus "}
              an advisor you can ask anything about these quotes.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={openPicker}>Upgrade</button>
        </div>
      ) : null}

      {pickerOpen && (
        <PlanPicker
          open
          quoteCount={project.quotes.length}
          currentPlan={project.plan}
          mode={payments}
          onClose={() => setPickerOpen(false)}
          onPurchase={purchase}
        />
      )}
    </section>
  );
}
