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
  /** Full scene when loaded (for manuscript / text filter). */
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
