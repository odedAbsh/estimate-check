import { useState } from "react";
import type { Project } from "../domain/types";
import { PLANS } from "../domain/plans";
import { getTrade } from "../domain/trades";
import { href } from "../lib/router";
import { ConfirmDialog } from "../components/Dialog";

interface Props {
  projects: Project[];
  onStart: () => void;
  onDelete: (id: string) => void;
}

export function Home({ projects, onStart, onDelete }: Props) {
  const [deleting, setDeleting] = useState<Project | null>(null);
  return (
    <>
      <section className="hero">
        <p className="eyebrow">For roofing, HVAC, remodels and every home project</p>
        <h1>The cheapest quote is rarely the best one.</h1>
        <p className="lede">
          Upload the quotes you got. We line them up side by side, price in what each one leaves out, check the license and lawsuit
          record, and tell you who to hire and why.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={onStart}>Compare my quotes</button>
          <span className="muted">Free side-by-side. Pay only for the verdict and background checks.</span>
        </div>
      </section>

      {projects.length > 0 && (
        <section className="section" aria-labelledby="yours">
          <h2 id="yours">Your comparisons</h2>
          <ul className="project-list">
            {projects.map((p) => {
              const step = p.plan ? "results" : p.quotes.length ? (p.priorities ? "results" : "quotes") : "job";
              return (
                <li key={p.id} className="card project-row">
                  <a href={href({ name: "step", projectId: p.id, step })}>
                    <strong>{p.title || `${getTrade(p.tradeId).label} project`}</strong>
                    <span className="muted">
                      {p.quotes.length} quote{p.quotes.length === 1 ? "" : "s"} · updated {new Date(p.updatedAt).toLocaleDateString()}
                      {p.plan ? " · unlocked" : ""}
                    </span>
                  </a>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDeleting(p)} aria-label={`Delete ${p.title || "comparison"}`}>
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="how">
        <h2 id="how">How it works</h2>
        <ol className="steps-grid">
          <li className="card">
            <span className="step-num">1</span>
            <h3>Add your quotes</h3>
            <p>Upload a PDF, paste the text, or fill in a short form. We read the price, scope, warranty and terms for you.</p>
          </li>
          <li className="card">
            <span className="step-num">2</span>
            <h3>Tell us what matters</h3>
            <p>Price, warranty, speed, a trustworthy rep. You set the weights, so the ranking reflects your priorities.</p>
          </li>
          <li className="card">
            <span className="step-num">3</span>
            <h3>Hire with confidence</h3>
            <p>See who's licensed, who's been sued and why, what each quote leaves out, and what to ask before you sign.</p>
          </li>
        </ol>
      </section>

      <section className="section" aria-labelledby="pricing">
        <h2 id="pricing">Pricing</h2>
        <p className="muted">One-time price per project. The side-by-side comparison is always free.</p>
        <div className="plans-grid">
          {PLANS.map((plan) => (
            <div key={plan.id} className={`card plan ${plan.id === "plus" ? "plan-featured" : ""}`}>
              {plan.id === "plus" && <span className="badge badge-accent">Most chosen</span>}
              <h3>{plan.name}</h3>
              <p className="price">
                ${plan.price}
                <span className="muted"> one time</span>
              </p>
              <ul className="checks">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={deleting != null}
        title={`Delete "${deleting?.title || "this comparison"}"?`}
        body="Its quotes and results will be removed from this browser. This can't be undone."
        confirmLabel="Delete comparison"
        danger
        onConfirm={() => {
          if (deleting) onDelete(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
