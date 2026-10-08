import { useCallback, useMemo, useRef, useState } from "react";
import { useProjects } from "./lib/useProjects";
import { useSession } from "./lib/session";
import { AppContext, type AppContextValue } from "./lib/AppContext";
import { navigate, useRoute } from "./lib/router";
import { Home } from "./pages/Home";
import { ProjectFlow } from "./pages/ProjectFlow";
import { AuthDialog } from "./components/AuthDialog";
import { newProject } from "./domain/quote";

export function App() {
  const route = useRoute();
  const session = useSession();
  const { projects, upsert, remove, flush, refresh, clearLocal, saveState } = useProjects(session.user);
  const [auth, setAuth] = useState<{ reason: string } | null>(null);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const requireAccount = useCallback(
    (reason: string) => {
      if (session.user) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        pending.current = resolve;
        setAuth({ reason });
      });
    },
    [session.user],
  );

  const closeAuth = (ok: boolean) => {
    setAuth(null);
    pending.current?.(ok);
    pending.current = null;
  };

  const ctx = useMemo<AppContextValue>(
    () => ({ user: session.user, payments: session.payments, requireAccount, flushProject: flush, refreshProject: refresh }),
    [session.user, session.payments, requireAccount, flush, refresh],
  );

  const start = () => {
    const p = newProject();
    upsert(p);
    navigate({ name: "step", projectId: p.id, step: "job" });
  };

  const signOut = async () => {
    await session.logout();
    clearLocal();
    navigate({ name: "home" });
  };

  const project = route.name === "step" ? projects.find((p) => p.id === route.projectId) : undefined;

  return (
    <AppContext.Provider value={ctx}>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="container topbar-inner">
          <a href="#/" className="brand" aria-label="Estimate Check home">
            <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--accent)" /><path d="M9 16.5l4.5 4.5L23 11.5" stroke="var(--on-accent)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Estimate Check
          </a>
          <div className="topbar-actions">
            {session.user ? (
              <>
                <span className="muted account-email" title={session.user.email}>{session.user.email}</span>
                <span className="save-state" role="status" aria-live="polite">
                  {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save" : saveState === "saved" ? "Saved" : ""}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
              </>
            ) : session.ready ? (
              <button className="btn btn-ghost btn-sm" onClick={() => requireAccount("Sign in to see your saved comparisons on any device.")}>Sign in</button>
            ) : null}
            <button className="btn btn-secondary btn-sm" onClick={start}>Compare quotes</button>
          </div>
        </div>
      </header>
      <main id="main" className="container">
        {route.name === "step" && project ? (
          <ProjectFlow project={project} step={route.step} onChange={upsert} />
        ) : route.name === "step" ? (
          <div className="empty">
            <h1>We couldn't find that comparison</h1>
            <p>It may have been deleted, or it was saved in a different browser or account.</p>
            <button className="btn btn-primary" onClick={start}>Start a new comparison</button>
          </div>
        ) : (
          <Home projects={projects} onStart={start} onDelete={remove} />
        )}
      </main>
      <footer className="footer container">
        <p>Estimate Check is independent. We don't take money from contractors, and we never sell your quotes.</p>
      </footer>
      <AuthDialog
        open={auth != null}
        reason={auth?.reason ?? ""}
        onClose={() => closeAuth(false)}
        onSubmit={async (mode, email, password) => {
          await session.authenticate(mode, email, password);
          closeAuth(true);
        }}
      />
    </AppContext.Provider>
  );
}
