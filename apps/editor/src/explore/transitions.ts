/**
 * E1-min: resolve action-bound transition vs project.transitionDefaults.
 */

import type { EffectDef, ExploreAction, TransitionDefaults } from "./types";

export type TransKind = "toDialogue" | "fromDialogue" | "gotoScene";

/** Which default slot an action uses when its own `trans` is omitted. */
export function transKindForAction(a: ExploreAction): TransKind | null {
  switch (a.type) {
    case "call":
      return "toDialogue";
    case "return":
      return "fromDialogue";
    case "gotoScene":
      return "gotoScene";
    default:
      return null;
  }
}

/**
 * Effective transition id for call / return / gotoScene.
 * Explicit `trans` wins; else project defaults; else undefined.
 */
export function resolveEffectiveTrans(
  action: ExploreAction,
  defaults?: TransitionDefaults | null,
): string | undefined {
  if (action.type === "call" || action.type === "gotoScene" || action.type === "return") {
    if (action.trans) return action.trans;
    const kind = transKindForAction(action);
    if (!kind || !defaults) return undefined;
    return defaults[kind];
  }
  return undefined;
}

export const BUILTIN_EFFECTS = [
  { id: "fade_black", kind: "fade" as const, params: { ms: 400, color: "#000000" } },
  { id: "crossfade", kind: "crossfade" as const, params: { ms: 400 } },
];

export function defaultTransitionDefaults(): TransitionDefaults {
  return {
    toDialogue: "fade_black",
    fromDialogue: "fade_black",
    gotoScene: "fade_black",
  };
}


/** Merge effects by id (existing wins over incoming duplicates). */
export function mergeEffectLibrary(
  existing: EffectDef[] | undefined,
  incoming: readonly EffectDef[],
): EffectDef[] {
  const byId = new Map<string, EffectDef>();
  for (const e of existing ?? []) byId.set(e.id, e);
  for (const e of incoming) {
    if (!byId.has(e.id)) byId.set(e.id, e);
  }
  return [...byId.values()];
}

/**
 * Ensure effect ids exist in the library; missing ids that match BUILTIN_EFFECTS
 * are copied in. Unknown custom ids are left unresolved (Problems can warn).
 */
export function ensureEffectsInLibrary(
  existing: EffectDef[] | undefined,
  ids: Iterable<string>,
): EffectDef[] {
  const needed: EffectDef[] = [];
  const have = new Set((existing ?? []).map((e) => e.id));
  for (const id of ids) {
    if (!id || have.has(id)) continue;
    const builtin = BUILTIN_EFFECTS.find((e) => e.id === id);
    if (builtin) {
      needed.push(builtin);
      have.add(id);
    }
  }
  if (needed.length === 0) return existing ?? [];
  return mergeEffectLibrary(existing, needed);
}
