import type { Project } from "../domain/types";
import { STEPS, href, type StepId } from "../lib/router";
import { JobStep } from "./JobStep";
import { QuotesStep } from "./QuotesStep";
import { PrioritiesStep } from "./PrioritiesStep";
import { ResultsStep } from "./ResultsStep";

interface Props {
  project: Project;
  step: StepId;
  onChange: (p: Project) => void;
}

export function ProjectFlow({ project, step, onChange }: Props) {
  const current = STEPS.findIndex((s) => s.id === step);
  const reachable = (id: StepId) => {
    if (id === "job") return true;
    if (id === "quotes") return Boolean(project.tradeId);
    return project.quotes.length > 0;
  };
  return (
    <div className="flow">
      <nav aria-label="Progress" className="stepper">
        <ol>
          {STEPS.map((s, i) => {
            const state = i < current ? "done" : i === current ? "current" : "todo";
            const content = (
              <>
                <span className="stepper-dot" aria-hidden="true">{i < current ? "✓" : i + 1}</span>
                <span className="stepper-label">{s.label}</span>
              </>
            );
            return (
              <li key={s.id} className={`stepper-item ${state}`}>
                {reachable(s.id) && i !== current ? (
                  <a href={href({ name: "step", projectId: project.id, step: s.id })}>{content}</a>
                ) : (
                  <span aria-current={i === current ? "step" : undefined}>{content}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {step === "job" && <JobStep project={project} onChange={onChange} />}
      {step === "quotes" && <QuotesStep project={project} onChange={onChange} />}
      {step === "priorities" && <PrioritiesStep project={project} onChange={onChange} />}
      {step === "results" && <ResultsStep project={project} onChange={onChange} />}
    </div>
  );
}
