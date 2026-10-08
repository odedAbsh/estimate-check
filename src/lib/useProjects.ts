import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanId, Project } from "../domain/types";
import { api, type User } from "./session";
import { loadProjects, saveProjects } from "./storage";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Anonymous visitors keep projects in this browser. Once signed in, the server
 * is the source of truth: it stores projects and is the only place that can say
 * which plan a project has paid for.
 */
export function useProjects(user: User | null) {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef(projects);
  latest.current = projects;

  useEffect(() => {
    if (!user) saveProjects(projects);
  }, [projects, user]);

  const applyPlan = useCallback((id: string, plan: PlanId | null) => {
    setProjects((all) => all.map((p) => (p.id === id && p.plan !== plan ? { ...p, plan } : p)));
  }, []);

  const push = useCallback(
    async (p: Project) => {
      setSaveState("saving");
      try {
        const r = await api<{ project?: Project; error?: string }>(`/api/projects/${p.id}`, "PUT", p);
        if (!r.ok) throw new Error(r.body.error);
        applyPlan(p.id, r.body.project?.plan ?? null);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [applyPlan],
  );

  // On sign-in: pull the account's projects and upload anything made before signing in.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const r = await api<{ projects: Project[] }>("/api/projects");
      if (cancelled || !r.ok) return;
      const server = r.body.projects.map((p) => ({ ...p, verifications: p.verifications ?? {} }));
      const known = new Set(server.map((p) => p.id));
      const local = latest.current.filter((p) => !known.has(p.id));
      await Promise.all(local.map((p) => push(p)));
      if (cancelled) return;
      setProjects([...local, ...server].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      saveProjects([]); // the browser copy now lives in the account
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, push]); // eslint-disable-line react-hooks/exhaustive-deps

  const upsert = useCallback(
    (p: Project) => {
      const stamped = { ...p, updatedAt: new Date().toISOString() };
      setProjects((all) => (all.some((x) => x.id === p.id) ? all.map((x) => (x.id === p.id ? stamped : x)) : [stamped, ...all]));
      if (!user) return;
      const t = timers.current.get(p.id);
      if (t) clearTimeout(t);
      setSaveState("saving");
      timers.current.set(
        p.id,
        setTimeout(() => {
          timers.current.delete(p.id);
          void push(stamped);
        }, 600),
      );
    },
    [user, push],
  );

  /** Save now (used before checkout so the server has the latest quotes). */
  const flush = useCallback(
    async (id: string) => {
      const t = timers.current.get(id);
      if (t) {
        clearTimeout(t);
        timers.current.delete(id);
      }
      const p = latest.current.find((x) => x.id === id);
      if (p && user) await push(p);
    },
    [user, push],
  );

  const refresh = useCallback(
    async (id: string) => {
      const r = await api<{ project?: Project }>(`/api/projects/${id}`);
      if (r.ok && r.body.project) applyPlan(id, r.body.project.plan ?? null);
    },
    [applyPlan],
  );

  const remove = useCallback(
    (id: string) => {
      setProjects((all) => all.filter((p) => p.id !== id));
      if (user) void api(`/api/projects/${id}`, "DELETE");
    },
    [user],
  );

  /** On sign-out, leave nothing behind on a shared computer. */
  const clearLocal = useCallback(() => {
    setProjects([]);
    saveProjects([]);
  }, []);

  return { projects, upsert, remove, flush, refresh, clearLocal, saveState };
}
