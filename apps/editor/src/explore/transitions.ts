/**
 * E1-min: resolve action-bound transition vs project.transitionDefaults.
 */

import type { ExploreAction, TransitionDefaults } from "./types";

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
