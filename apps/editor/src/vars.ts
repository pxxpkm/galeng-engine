import type { Scene } from "./types";

export type VarKind = "set" | "if";
export type VarWhere = "choice" | "branch" | "beat";

export interface VarSite {
  key: string;
  sceneId: string;
  sceneTitle?: string;
  kind: VarKind;
  where: VarWhere;
  beatIndex?: number;
  choiceIndex?: number;
  note: string;
}

export interface VarRow {
  key: string;
  count: number;
  sites: VarSite[];
}

function keysOfMap(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>).filter((key) => key.trim().length > 0);
}

function pushSite(out: VarSite[], site: VarSite): void {
  const key = site.key.trim();
  if (!key) {
    return;
  }
  out.push({ ...site, key });
}

export function collectVars(scenes: Scene[]): VarSite[] {
  const out: VarSite[] = [];
  for (const scene of scenes) {
    const at = { sceneId: scene.id, sceneTitle: scene.title };
    scene.beats.forEach((beat, beatIndex) => {
      if (!beat.set) {
        return;
      }
      for (const [key, value] of Object.entries(beat.set)) {
        pushSite(out, {
          ...at,
          key,
          kind: "set",
          where: "beat",
          beatIndex,
          note: String(value),
        });
      }
    });
    const exit = scene.exit;
    if (exit?.type === "choices") {
      exit.options.forEach((opt, choiceIndex) => {
        if (opt.set) {
          for (const [key, value] of Object.entries(opt.set)) {
            pushSite(out, {
              ...at,
              key,
              kind: "set",
              where: "choice",
              choiceIndex,
              note: [opt.text.trim(), String(value)].filter(Boolean).join(" · "),
            });
          }
        }
        for (const key of keysOfMap(opt.if)) {
          pushSite(out, {
            ...at,
            key,
            kind: "if",
            where: "choice",
            choiceIndex,
            note: opt.text.trim(),
          });
        }
      });
    }
    if (exit?.type === "branch") {
      for (const key of keysOfMap(exit.if)) {
        pushSite(out, {
          ...at,
          key,
          kind: "if",
          where: "branch",
          note: "",
        });
      }
    }
  }
  return out;
}

export function buildVarList(sites: VarSite[]): VarRow[] {
  const grouped = new Map<string, VarSite[]>();
  for (const site of sites) {
    const list = grouped.get(site.key) ?? [];
    list.push(site);
    grouped.set(site.key, list);
  }
  return [...grouped.entries()]
    .map(([key, list]) => ({ key, count: list.length, sites: list }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function varsOf(scenes: Scene[]): VarRow[] {
  return buildVarList(collectVars(scenes));
}

/** Sorted unique variable names across every set/if site; drives datalist hints. */
export function varNames(scenes: Scene[]): string[] {
  return varsOf(scenes).map((row) => row.key);
}
