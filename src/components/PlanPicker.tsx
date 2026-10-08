import { useState } from "react";
import { PLANS, getPlan, type Plan } from "../domain/plans";
import type { PlanId } from "../domain/types";
import { Dialog } from "./Dialog";

interface Props {
  open: boolean;
  quoteCount: number;
  currentPlan: PlanId | null;
  onClose: () => void;
  mode: "stripe" | "demo" | "off";
  /** Resolves to an error message, or null when it worked (or the browser is leaving for Stripe). */
  onPurchase: (plan: PlanId) => Promise<string | null>;
}

export function PlanPicker({ open, quoteCount, currentPlan, mode, onClose, onPurchase }: Props) {
  const current = getPlan(currentPlan);
  const available = PLANS.filter((p) => !current || p.price > current.price);
  const recommended = available.find((p) => p.maxQuotes >= quoteCount && p.licenseCheck) ?? available.find((p) => p.maxQuotes >= quoteCount);
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const chosen = getPlan(selected ?? recommended?.id ?? null);
  const due = chosen ? chosen.price - (current?.price ?? 0) : 0;

  const fits = (p: Plan) => p.maxQuotes >= quoteCount;

  return (
    <Dialog
      open={open}
      wide
      title={current ? "Upgrade your plan" : "Unlock your recommendation"}
      onClose={onClose}
      footer={
        <>
          <p className="footer-note">
            {mode === "stripe" ? "You'll pay securely on Stripe. We never see your card." : mode === "demo" ? "Demo checkout. No card is charged in this prototype." : "Payments are unavailable right now."}
          </p>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!chosen || !fits(chosen) || paying || mode === "off"}
            aria-busy={paying}
            onClick={async () => {
              if (!chosen) return;
              setPaying(true);
              setError("");
              const err = await onPurchase(chosen.id);
              if (err) setError(err);
              setPaying(false);
            }}
          >
            {paying ? <span className="spinner" aria-hidden="true" /> : null}
            {chosen ? `Pay $${due} and unlock` : "Choose a plan"}
          </button>
        </>
      }
    >
      {error && (
        <p role="alert" className="notice notice-warn">
          {error}
        </p>
      )}
      <p className="muted">You have {quoteCount} quote{quoteCount === 1 ? "" : "s"}. One-time payment for this project.</p>
      <div className="plans-grid" role="radiogroup" aria-label="Plans">
        {available.map((p) => {
          const disabled = !fits(p);
          const isSel = chosen?.id === p.id;
          return (
            <label key={p.id} className={`card plan plan-option ${isSel ? "selected" : ""} ${disabled ? "disabled" : ""}`}>
              <input type="radio" name="plan" value={p.id} checked={isSel} disabled={disabled} onChange={() => setSelected(p.id)} />
              {p.id === recommended?.id && <span className="badge badge-accent">Recommended</span>}
              <span className="plan-name">{p.name}</span>
              <span className="price">
                ${current ? p.price - current.price : p.price}
                {current && <span className="muted"> more</span>}
              </span>
              <ul className="checks">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {disabled && <span className="hint">Fits up to {p.maxQuotes} quotes. Remove some or pick a bigger plan.</span>}
            </label>
          );
        })}
      </div>
    </Dialog>
  );
}
