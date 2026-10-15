/**
 * Pure reference counts for delete confirms (M7).
 * Scans the current ExploreDoc scene (+ onEnter / hotspot preds).
 */

import type { ExploreAction, ExploreDoc, Pred } from "./types";

export interface HotspotDeleteImpact {
  /** Interaction entries for this hotspot. */
  interactions: number;
  /** Sum of rules across those interactions. */
  rules: number;
}

function walkPreds(preds: Pred[] | null | undefined, visit: (p: Pred) => void): void {
  if (!preds) return;
  for (const p of preds) visit(p);
}

function walkActions(actions: ExploreAction[], visit: (a: ExploreAction) => void): void {
  for (const a of actions) visit(a);
}

function walkSceneActionsAndPreds(
  doc: ExploreDoc,
  visitPred: (p: Pred) => void,
  visitAction: (a: ExploreAction) => void,
): void {
  for (const h of doc.scene.hotspots) {
    walkPreds(h.visibleIf, visitPred);
    walkPreds(h.enabledIf, visitPred);
  }
  for (const inter of doc.scene.interactions) {
    for (const rule of inter.rules) {
      walkPreds(rule.when, visitPred);
      walkActions(rule.do, visitAction);
    }
  }
  walkActions(doc.scene.onEnter ?? [], visitAction);
}

/** Interactions + rules removed when deleting a hotspot. */
export function countHotspotDeleteImpact(
  doc: ExploreDoc,
  hotspotId: string,
): HotspotDeleteImpact {
  let interactions = 0;
  let rules = 0;
  for (const inter of doc.scene.interactions) {
    if (inter.hotspot !== hotspotId) continue;
    interactions += 1;
    rules += inter.rules.length;
  }
  return { interactions, rules };
}

/** References to a switch: when / visibleIf / enabledIf / setSwitch. */
export function countSwitchRefs(doc: ExploreDoc, switchId: string): number {
  let n = 0;
  walkSceneActionsAndPreds(
    doc,
    (p) => {
      if ("switch" in p && p.switch === switchId) n += 1;
    },
    (a) => {
      if (a.type === "setSwitch" && a.id === switchId) n += 1;
    },
  );
  return n;
}

/**
 * References to an item: hasItem preds, giveItem/takeItem, and
 * matrix cells keyed by on.item.
 */
export function countItemRefs(doc: ExploreDoc, itemId: string): number {
  let n = 0;
  for (const inter of doc.scene.interactions) {
    if ("item" in inter.on && inter.on.item === itemId) n += 1;
  }
  walkSceneActionsAndPreds(
    doc,
    (p) => {
      if ("hasItem" in p && p.hasItem === itemId) n += 1;
    },
    (a) => {
      if ((a.type === "giveItem" || a.type === "takeItem") && a.id === itemId) n += 1;
    },
  );
  return n;
}

/** References to a character: say.speaker. */
export function countCharacterRefs(doc: ExploreDoc, characterId: string): number {
  let n = 0;
  walkSceneActionsAndPreds(
    doc,
    () => {},
    (a) => {
      if (a.type === "say" && a.speaker === characterId) n += 1;
    },
  );
  return n;
}

export function confirmDeleteHotspotMessage(
  hotspotId: string,
  impact: HotspotDeleteImpact,
): string {
  const name = hotspotId;
  if (impact.interactions === 0) {
    return `確定刪除熱區「${name}」？`;
  }
  return `確定刪除熱區「${name}」？將一併移除 ${impact.interactions} 個互動（共 ${impact.rules} 條規則）。`;
}

export function confirmDeleteSwitchMessage(switchId: string, refs: number): string {
  if (refs <= 0) return `確定刪除開關「${switchId}」？`;
  return `此開關被 ${refs} 處引用，確定刪除「${switchId}」？`;
}

export function confirmDeleteItemMessage(itemId: string, refs: number): string {
  if (refs <= 0) return `確定刪除物品「${itemId}」？`;
  return `此物品被 ${refs} 處引用，確定刪除「${itemId}」？`;
}

export function confirmDeleteCharacterMessage(characterId: string, refs: number): string {
  if (refs <= 0) return `確定刪除角色「${characterId}」？`;
  return `此角色被 ${refs} 處引用，確定刪除「${characterId}」？`;
}

export type ConfirmFn = (message: string) => boolean;

export function defaultConfirmFn(message: string): boolean {
  return typeof window !== "undefined" ? window.confirm(message) : false;
}
