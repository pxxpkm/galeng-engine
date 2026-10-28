/**
 * Build SceneCatalogEntry[] for Call picker + deadEndCall Problems.
 * Infers kind from sceneKind / hotspots; hasReturn from exit.type === "return"
 * or a Next/Choices/Branch path that reaches a return exit (cross-scene).
 */

import { getJson } from "../api";
import { inferListedSceneKind } from "../editorRoute";
import type { ExplorePersistApi } from "./persist";
import type { SceneCatalogEntry } from "./types";

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** Scene ids reachable via Exit::Next / Choices / Branch only (not Call). */
export function exitForwardTargets(exitRaw: unknown): string[] {
  const exit = asRecord(exitRaw);
  if (!exit || typeof exit.type !== "string") return [];
  switch (exit.type) {
    case "next": {
      const g = exit.goto;
      return typeof g === "string" && g.trim() ? [g.trim()] : [];
    }
    case "choices": {
      if (!Array.isArray(exit.options)) return [];
      const out: string[] = [];
      for (const opt of exit.options) {
        const o = asRecord(opt);
        const g = o?.goto;
        if (typeof g === "string" && g.trim()) out.push(g.trim());
      }
      return out;
    }
    case "branch": {
      const out: string[] = [];
      for (const key of ["then", "else"] as const) {
        const g = exit[key];
        if (typeof g === "string" && g.trim()) out.push(g.trim());
      }
      return out;
    }
    default:
      return [];
  }
}

function localHasReturn(exitRaw: unknown): boolean {
  const exit = asRecord(exitRaw);
  return exit?.type === "return";
}

/** BFS: true if start or any Next/Choices/Branch-reachable scene has Exit::Return. */
export function reachableHasReturn(
  startId: string,
  returnById: Map<string, boolean>,
  edges: Map<string, string[]>,
): boolean {
  const visited = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (returnById.get(id) === true) return true;
    for (const n of edges.get(id) ?? []) {
      if (!visited.has(n)) queue.push(n);
    }
  }
  return false;
}

/** Pure: one scene JSON → catalog entry (missing id → null). Local hasReturn only. */
export function sceneRawToCatalogEntry(raw: unknown): SceneCatalogEntry | null {
  const o = asRecord(raw);
  if (!o) return null;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : null;
  if (!id) return null;

  const kind = inferListedSceneKind({ sceneKind: o.sceneKind, hotspots: o.hotspots });

  const title = typeof o.title === "string" ? o.title : undefined;
  const entry: SceneCatalogEntry = { id, kind, title };

  if (kind === "dialogue") {
    entry.hasReturn = localHasReturn(o.exit);
  }

  return entry;
}

/**
 * Build catalog from scene raws. Dialogue `hasReturn` is true if the scene's
 * own exit is return, or any Next/Choices/Branch path reaches a return exit.
 */
export function buildSceneCatalog(raws: unknown[]): SceneCatalogEntry[] {
  const out: SceneCatalogEntry[] = [];
  const seen = new Set<string>();
  const returnById = new Map<string, boolean>();
  const edges = new Map<string, string[]>();

  for (const raw of raws) {
    const e = sceneRawToCatalogEntry(raw);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);

    const o = asRecord(raw);
    if (e.kind === "dialogue") {
      returnById.set(e.id, localHasReturn(o?.exit));
      edges.set(e.id, exitForwardTargets(o?.exit));
    }
  }

  for (const e of out) {
    if (e.kind !== "dialogue") continue;
    e.hasReturn = reachableHasReturn(e.id, returnById, edges);
  }

  return out;
}

/** List scene ids via optional persist hook or HTTP /api/scenes. */
export async function listSceneIds(api?: ExplorePersistApi): Promise<string[]> {
  if (api?.listSceneIds) {
    return api.listSceneIds();
  }
  try {
    const metas = await getJson<{ id: string }[]>("/api/scenes");
    if (Array.isArray(metas)) {
      return metas
        .map((m) => (m && typeof m.id === "string" ? m.id : ""))
        .filter(Boolean);
    }
  } catch {
    // offline / no host
  }
  return [];
}

/** Load every scenario JSON and build catalog (HTTP or FS persist). */
export async function loadSceneCatalog(
  api: ExplorePersistApi,
): Promise<SceneCatalogEntry[]> {
  const ids = await listSceneIds(api);
  if (ids.length === 0) return [];
  const raws: unknown[] = [];
  for (const id of ids) {
    try {
      raws.push(await api.loadScene(id));
    } catch {
      // skip missing
    }
  }
  return buildSceneCatalog(raws);
}
