import type { Priorities, Project } from "../domain/types";
import { DEFAULT_PRIORITIES, FACTORS, PRIORITY_LEVELS } from "../domain/quote";
import { navigate } from "../lib/router";
import { Segmented } from "../components/Fields";

interface Props {
  project: Project;
  onChange: (p: Project) => void;
}

export function PrioritiesStep({ project, onChange }: Props) {
  const priorities: Priorities = project.priorities ?? DEFAULT_PRIORITIES;
  const set = (key: keyof Priorities, value: number) => onChange({ ...project, priorities: { ...priorities, [key]: value } });
  const allZero = Object.values(priorities).every((v) => v === 0);

  return (
    <section className="panel" aria-labelledby="prio-title">
      <h1 id="prio-title">What matters most to you?</h1>
      <p className="muted">
        Now that your quotes are in, tell us how to weigh them. We've set sensible defaults; change anything that doesn't fit. Red flags
        like an expired license count against a contractor no matter what you choose here.
      </p>
      <ul className="priority-list">
        {FACTORS.map((f) => (
          <li key={f.key} className="priority-row">
            <div>
              <strong>{f.label}</strong>
              <p className="hint">{f.question}</p>
            </div>
            <Segmented
              legend={f.label}
              hideLegend
              name={`prio-${f.key}`}
              value={PRIORITY_LEVELS.some((l) => l.value === priorities[f.key]) ? priorities[f.key] : null}
              options={PRIORITY_LEVELS}
              onChange={(v) => set(f.key, v)}
            />
          </li>
        ))}
      </ul>
      {allZero && <p className="notice notice-warn">Mark at least one thing as mattering, so we can rank the quotes.</p>}
      <div className="actions">
        <button
          className="btn btn-primary btn-lg"
          disabled={allZero}
          onClick={() => {
            if (!project.priorities) onChange({ ...project, priorities });
            navigate({ name: "step", projectId: project.id, step: "results" });
          }}
        >
          Compare my quotes
        </button>
      </div>
    </section>
  );
}
