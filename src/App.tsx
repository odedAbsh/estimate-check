import { useProjects } from "./lib/useProjects";
import { navigate, useRoute } from "./lib/router";
import { Home } from "./pages/Home";
import { ProjectFlow } from "./pages/ProjectFlow";
import { newProject } from "./domain/quote";

export function App() {
  const route = useRoute();
  const { projects, upsert, remove } = useProjects();

  const start = () => {
    const p = newProject();
    upsert(p);
    navigate({ name: "step", projectId: p.id, step: "job" });
  };

  const project = route.name === "step" ? projects.find((p) => p.id === route.projectId) : undefined;

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="container topbar-inner">
          <a href="#/" className="brand" aria-label="Estimate Check home">
            <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--accent)" /><path d="M9 16.5l4.5 4.5L23 11.5" stroke="var(--on-accent)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Estimate Check
          </a>
          <button className="btn btn-secondary btn-sm" onClick={start}>Compare quotes</button>
        </div>
      </header>
      <main id="main" className="container">
        {route.name === "step" && project ? (
          <ProjectFlow project={project} step={route.step} onChange={upsert} />
        ) : route.name === "step" ? (
          <div className="empty">
            <h1>We couldn't find that comparison</h1>
            <p>It may have been deleted, or it was saved in a different browser.</p>
            <button className="btn btn-primary" onClick={start}>Start a new comparison</button>
          </div>
        ) : (
          <Home projects={projects} onStart={start} onDelete={remove} />
        )}
      </main>
      <footer className="footer container">
        <p>Estimate Check is independent. We don't take money from contractors, and we never sell your quotes.</p>
      </footer>
    </>
  );
}
