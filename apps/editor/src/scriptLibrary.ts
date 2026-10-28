/**
 * Script Manager library helpers — filter/index scenes without schema change.
 */
import { exitHint } from "./route";
import type { Exit, Scene, SceneMeta } from "./types";

export type ScriptKindFilter = "all" | "dialogue" | "explore";

export type ScriptExitKind =
  | "none"
  | "next"
  | "choices"
  | "branch"
  | "call"
  | "return"
  | "end"
  | "other";

export interface ScriptRow {
  id: string;
  title: string;
  sceneKind: "dialogue" | "explore";
  beatCount: number;
  exitKind: ScriptExitKind;
  hasCall: boolean;
  hasReturn: boolean;
  unresolvedGoto: boolean;
  speakers: string[];
  archived: boolean;
  /**
   * Relative scene file. Set on a failed read so the row can name the file
   * without pretending the body was an empty scene.
   */
  fileName?: string;
  /**
   * Set when this scene's body could not be read. Absent scene + this flag
   * is a failure, not "Beat 0". Table-level failures are separate: they reject
   * `loadScriptRows`'s caller instead of painting every row as empty.
   */
  loadError?: string;
  /** Full scene when loaded (for manuscript / text filter). Never set on loadError. */
  scene?: Scene;
}

export function exitKindOf(exit: Exit | undefined): ScriptExitKind {
  if (!exit) return "none";
  switch (exit.type) {
    case "next":
      return "next";
    case "choices":
      return "choices";
    case "branch":
      return "branch";
    case "call":
      return "call";
    case "return":
      return "return";
    case "end":
      return "end";
    default:
      return "other";
  }
}

export function inferSceneKind(scene: Scene): "dialogue" | "explore" {
  if (scene.sceneKind === "explore") return "explore";
  if (scene.sceneKind === "dialogue") return "dialogue";
  if (Array.isArray(scene.hotspots) && scene.hotspots.length > 0) return "explore";
  return "dialogue";
}

function speakersInScene(scene: Scene): string[] {
  const out = new Set<string>();
  for (const beat of scene.beats ?? []) {
    const sp = beat.say?.speaker?.trim();
    if (sp) out.add(sp);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function sceneHasCallAction(scene: Scene): boolean {
  if (scene.exit?.type === "call") return true;
  const interactions = scene.interactions as
    | { rules?: { do?: { type?: string }[] }[] }[]
    | undefined;
  if (!Array.isArray(interactions)) return false;
  for (const inter of interactions) {
    for (const rule of inter.rules ?? []) {
      for (const act of rule.do ?? []) {
        if (act?.type === "call") return true;
      }
    }
  }
  return false;
}

export function scriptRowFromScene(
  scene: Scene,
  opts: { archived?: boolean; allIds: Set<string> },
): ScriptRow {
  const exitKind = exitKindOf(scene.exit);
  const hint = exitHint(scene.exit, opts.allIds);
  return {
    id: scene.id,
    title: scene.title?.trim() || scene.id,
    sceneKind: inferSceneKind(scene),
    beatCount: scene.beats?.length ?? 0,
    exitKind,
    hasCall: sceneHasCallAction(scene),
    hasReturn: exitKind === "return" || scene.exit?.type === "return",
    unresolvedGoto: hint.missing,
    speakers: speakersInScene(scene),
    archived: Boolean(opts.archived),
    scene,
  };
}

/** Live scene body on disk: `scenario/<id>.json` (host `scene_path`). */
export function sceneBodyFileName(id: string): string {
  return `scenario/${id}.json`;
}

/**
 * One scene GET failed. Do not synthesize `beats: []` — callers must not
 * treat this row as an empty manuscript.
 */
export function scriptRowFromLoadFailure(
  meta: { id: string; title?: string },
  message: string,
): ScriptRow {
  return {
    id: meta.id,
    title: meta.title?.trim() || meta.id,
    sceneKind: "dialogue",
    beatCount: -1,
    exitKind: "none",
    hasCall: false,
    hasReturn: false,
    unresolvedGoto: false,
    speakers: [],
    archived: false,
    fileName: sceneBodyFileName(meta.id),
    loadError: message,
  };
}

export type ExportScenesResult =
  | { ok: true; scenes: Scene[] }
  | { ok: false; missing: { id: string; fileName: string }[] };

/**
 * Live rows must all have a body. A `loadError` (or a live row with no scene)
 * aborts the export and names the file. Archived meta rows are not failures.
 */
export function readableScenesForExport(rows: ScriptRow[]): ExportScenesResult {
  const missing = rows
    .filter((row) => !row.archived && (row.loadError || !row.scene))
    .map((row) => ({
      id: row.id,
      fileName: row.fileName ?? sceneBodyFileName(row.id),
    }));
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    scenes: rows.filter((row) => !row.archived).map((row) => row.scene as Scene),
  };
}

/**
 * Load live scene bodies. A single GET failure becomes that row's `loadError`
 * and does not reject the whole list. Archived entries stay meta-only.
 */
export async function loadScriptRows(
  live: SceneMeta[],
  archived: SceneMeta[],
  current: Scene | null,
  fetchScene: (id: string) => Promise<Scene>,
): Promise<ScriptRow[]> {
  const allIds = new Set([...live, ...archived].map((m) => m.id));
  const rows: ScriptRow[] = [];

  for (const meta of live) {
    if (current && current.id === meta.id) {
      rows.push(scriptRowFromScene(current, { archived: false, allIds }));
      continue;
    }
    try {
      const scene = await fetchScene(meta.id);
      rows.push(scriptRowFromScene(scene, { archived: false, allIds }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows.push(scriptRowFromLoadFailure(meta, message));
    }
  }

  for (const meta of archived) {
    rows.push(scriptRowFromMeta(meta, { archived: true, allIds }));
  }

  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

/** Retry one live scene. Success replaces the failure; failure stays a loadError row. */
export async function reloadScriptRow(
  meta: { id: string; title?: string },
  allIds: Set<string>,
  fetchScene: () => Promise<Scene>,
): Promise<ScriptRow> {
  try {
    const scene = await fetchScene();
    return scriptRowFromScene(scene, { archived: false, allIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return scriptRowFromLoadFailure(meta, message);
  }
}

/** Lightweight row from meta only (beat count unknown until full load). */
export function scriptRowFromMeta(
  meta: SceneMeta,
  opts: { archived?: boolean; allIds: Set<string> },
): ScriptRow {
  const exitKind = exitKindOf(meta.exit);
  const hint = exitHint(meta.exit, opts.allIds);
  return {
    id: meta.id,
    title: meta.title?.trim() || meta.id,
    sceneKind: "dialogue",
    beatCount: -1,
    exitKind,
    hasCall: exitKind === "call",
    hasReturn: exitKind === "return",
    unresolvedGoto: hint.missing,
    speakers: [],
    archived: Boolean(opts.archived),
  };
}

export interface ScriptFilters {
  kind: ScriptKindFilter;
  query: string;
  speaker: string;
  /** "" | "call" | "return" | "either" */
  callReturn: "" | "call" | "return" | "either";
  unresolvedOnly: boolean;
}

export const DEFAULT_SCRIPT_FILTERS: ScriptFilters = {
  kind: "all",
  query: "",
  speaker: "",
  callReturn: "",
  unresolvedOnly: false,
};

export function filterScriptRows(rows: ScriptRow[], filters: ScriptFilters): ScriptRow[] {
  const q = filters.query.trim().toLowerCase();
  const speaker = filters.speaker.trim();
  return rows.filter((row) => {
    // A failed read must stay visible. Hiding it looks like an empty library.
    if (row.loadError) return true;
    if (filters.kind !== "all" && row.sceneKind !== filters.kind) return false;
    if (filters.unresolvedOnly && !row.unresolvedGoto) return false;
    if (filters.callReturn === "call" && !row.hasCall) return false;
    if (filters.callReturn === "return" && !row.hasReturn) return false;
    if (filters.callReturn === "either" && !row.hasCall && !row.hasReturn) return false;
    if (speaker && !row.speakers.includes(speaker)) return false;
    if (q) {
      const hay = [
        row.id,
        row.title,
        row.sceneKind,
        row.exitKind,
        ...(row.speakers ?? []),
        row.scene ? JSON.stringify(row.scene.beats ?? []) : "",
      ]
        .join("\n")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function collectSpeakers(rows: ScriptRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    for (const s of row.speakers) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
