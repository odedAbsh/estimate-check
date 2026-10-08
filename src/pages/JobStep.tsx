import { useState } from "react";
import type { Project } from "../domain/types";
import { TRADES } from "../domain/trades";
import { US_STATES } from "../domain/states";
import { navigate } from "../lib/router";

interface Props {
  project: Project;
  onChange: (p: Project) => void;
}

export function JobStep({ project, onChange }: Props) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<Project>) => onChange({ ...project, ...patch });
  const zipError = project.zip && !/^\d{5}$/.test(project.zip) ? "Enter a 5-digit ZIP code, like 78701." : "";
  const stateError = !project.state ? "Pick the state where the work will be done. Licensing rules are set by each state." : "";
  const showState = (touched.state || submitted) && stateError;
  const showZip = (touched.zip || submitted) && zipError;

  const next = () => {
    setSubmitted(true);
    if (stateError || zipError) return;
    navigate({ name: "step", projectId: project.id, step: "quotes" });
  };

  return (
    <section className="panel" aria-labelledby="job-title">
      <h1 id="job-title">What's the job?</h1>
      <p className="muted">This tells us what a complete quote should include and which license to look for.</p>

      <fieldset className="field">
        <legend className="label">Type of work</legend>
        <div className="trade-grid" role="radiogroup">
          {TRADES.map((t) => (
            <label key={t.id} className={`trade-option ${project.tradeId === t.id ? "selected" : ""}`}>
              <input type="radio" name="trade" value={t.id} checked={project.tradeId === t.id} onChange={() => set({ tradeId: t.id })} />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="label" htmlFor="title">Project name <span className="optional">optional</span></label>
        <input id="title" className="input" value={project.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Roof replacement – Elm St" />
      </div>

      <div className="field">
        <label className="label" htmlFor="desc">Describe the work <span className="optional">optional</span></label>
        <textarea id="desc" className="input" rows={3} value={project.description} onChange={(e) => set({ description: e.target.value })} />
        <p className="hint">Size, materials you want, anything a contractor should know. Helps the advisor give better answers.</p>
      </div>

      <div className="row-2">
        <div className="field">
          <label className="label" htmlFor="state">State</label>
          <select
            id="state"
            className="input"
            value={project.state}
            aria-invalid={Boolean(showState)}
            aria-describedby={showState ? "state-err" : undefined}
            onChange={(e) => set({ state: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, state: true }))}
          >
            <option value="">Select a state</option>
            {US_STATES.map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          {showState && <p id="state-err" className="error">{stateError}</p>}
        </div>
        <div className="field">
          <label className="label" htmlFor="zip">ZIP code <span className="optional">optional</span></label>
          <input
            id="zip"
            className="input"
            inputMode="numeric"
            maxLength={5}
            value={project.zip}
            aria-invalid={Boolean(showZip)}
            aria-describedby={showZip ? "zip-err" : undefined}
            onChange={(e) => set({ zip: e.target.value.replace(/\D/g, "") })}
            onBlur={() => setTouched((t) => ({ ...t, zip: true }))}
          />
          {showZip && <p id="zip-err" className="error">{zipError}</p>}
        </div>
      </div>

      <div className="actions">
        <button className="btn btn-primary btn-lg" onClick={next}>Continue to quotes</button>
      </div>
    </section>
  );
}
