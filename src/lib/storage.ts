import type { Project } from "../domain/types";

const KEY = "estimate-check:projects:v1";

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Project[];
    return Array.isArray(parsed) ? parsed.map((p) => ({ ...p, verifications: p.verifications ?? {} })) : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(projects));
  } catch {
    // Storage full or blocked (private mode). The app keeps working for this visit.
  }
}
