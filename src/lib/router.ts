import { useEffect, useState } from "react";

export type Route =
  | { name: "home" }
  | { name: "step"; projectId: string; step: StepId };

export type StepId = "job" | "quotes" | "priorities" | "results";
export const STEPS: { id: StepId; label: string }[] = [
  { id: "job", label: "The job" },
  { id: "quotes", label: "Your quotes" },
  { id: "priorities", label: "What matters" },
  { id: "results", label: "Results" },
];

export function parseHash(hash: string): Route {
  const m = hash.match(/^#\/p\/([\w-]+)\/(job|quotes|priorities|results)$/);
  if (m) return { name: "step", projectId: m[1], step: m[2] as StepId };
  return { name: "home" };
}

export function href(route: Route): string {
  return route.name === "home" ? "#/" : `#/p/${route.projectId}/${route.step}`;
}

export function navigate(route: Route) {
  window.location.hash = href(route);
  window.scrollTo({ top: 0 });
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
