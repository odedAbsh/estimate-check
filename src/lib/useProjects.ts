import { useCallback, useEffect, useState } from "react";
import type { Project } from "../domain/types";
import { loadProjects, saveProjects } from "./storage";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  useEffect(() => saveProjects(projects), [projects]);

  const upsert = useCallback((p: Project) => {
    const stamped = { ...p, updatedAt: new Date().toISOString() };
    setProjects((all) => (all.some((x) => x.id === p.id) ? all.map((x) => (x.id === p.id ? stamped : x)) : [stamped, ...all]));
  }, []);
  const remove = useCallback((id: string) => setProjects((all) => all.filter((p) => p.id !== id)), []);
  return { projects, upsert, remove };
}
