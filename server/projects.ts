import express, { type Router } from "express";
import { z } from "zod";
import { PLANS, getPlan } from "../src/domain/plans";
import type { PlanId } from "../src/domain/types";
import type { Db } from "./db";
import { requireUser } from "./auth";

const MAX_BYTES = 600_000;

const ProjectBody = z
  .object({
    id: z.string().regex(/^[\w-]{3,60}$/),
    quotes: z.array(z.unknown()).max(9),
  })
  .passthrough();

export function planOf(db: Db, projectId: string): PlanId | null {
  const rows = db.prepare("SELECT plan FROM purchases WHERE project_id = ?").all(projectId) as { plan: PlanId }[];
  let best: PlanId | null = null;
  for (const { plan } of rows) {
    if (!best || (getPlan(plan)?.price ?? 0) > (getPlan(best)?.price ?? 0)) best = plan;
  }
  return best;
}

export function loadProject(db: Db, userId: string, id: string): Record<string, unknown> | null {
  const row = db.prepare("SELECT data FROM projects WHERE id = ? AND user_id = ?").get(id, userId) as { data: string } | undefined;
  if (!row) return null;
  // The plan always comes from recorded payments, never from what the browser stored.
  return { ...JSON.parse(row.data), plan: planOf(db, id) };
}

export function projectRoutes(db: Db, now: () => Date): Router {
  const r = express.Router();
  r.use(requireUser);

  r.get("/", (req, res) => {
    const rows = db.prepare("SELECT id FROM projects WHERE user_id = ? ORDER BY updated_at DESC").all(req.user!.id) as { id: string }[];
    res.json({ projects: rows.map((x) => loadProject(db, req.user!.id, x.id)) });
  });

  r.put("/:id", (req, res) => {
    const parsed = ProjectBody.safeParse(req.body);
    if (!parsed.success || parsed.data.id !== req.params.id) return res.status(400).json({ error: "That project couldn't be saved." });
    const { plan: _ignored, ...data } = parsed.data as Record<string, unknown>;
    void _ignored;
    const json = JSON.stringify(data);
    if (json.length > MAX_BYTES) return res.status(413).json({ error: "That project is too large to save." });

    const existing = db.prepare("SELECT user_id FROM projects WHERE id = ?").get(req.params.id) as { user_id: string } | undefined;
    if (existing && existing.user_id !== req.user!.id) return res.status(404).json({ error: "Project not found." });

    const plan = planOf(db, req.params.id);
    const cap = getPlan(plan)?.maxQuotes ?? 9;
    if (parsed.data.quotes.length > cap && plan) {
      // Keep saving, but the UI tells them to upgrade or remove quotes; nothing is lost.
    }
    db.prepare(
      "INSERT INTO projects (id, user_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    ).run(req.params.id, req.user!.id, json, now().toISOString());
    res.json({ project: loadProject(db, req.user!.id, req.params.id) });
  });

  r.get("/:id", (req, res) => {
    const p = loadProject(db, req.user!.id, req.params.id);
    if (!p) return res.status(404).json({ error: "Project not found." });
    res.json({ project: p });
  });

  r.delete("/:id", (req, res) => {
    db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(req.params.id, req.user!.id);
    res.json({ ok: true });
  });

  return r;
}

export const PLAN_IDS = PLANS.map((p) => p.id);
