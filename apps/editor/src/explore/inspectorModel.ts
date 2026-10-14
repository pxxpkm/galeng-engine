/**
 * Pure helpers for Inspector rule-card editing.
 * Never drop unsupported when/do entries when patching supported fields.
 */

import type {
  ExploreAction,
  ExploreDoc,
  InteractionOn,
  InteractionRule,
  Pred,
} from "./types";
import { sameOn } from "./types";

/** Action types editable via GUI dropdowns (M2 + M3 Call/Return/Goto). */
export const EDITABLE_ACTION_TYPES = [
  "say",
  "setSwitch",
  "giveItem",
  "takeItem",
  "call",
  "return",
  "gotoScene",
] as const;
export type EditableActionType = (typeof EDITABLE_ACTION_TYPES)[number];

export function isEditableAction(a: ExploreAction): a is Extract<
  ExploreAction,
  { type: EditableActionType }
> {
  return (EDITABLE_ACTION_TYPES as readonly string[]).includes(a.type);
}

/** When predicates editable via M2 GUI (switch is …). */
export function isEditablePred(p: Pred): p is { switch: string; is: boolean } {
  return "switch" in p && typeof (p as { is?: unknown }).is === "boolean";
}

export function getCellRules(
  doc: ExploreDoc,
  hotspotId: string,
  on: InteractionOn,
): InteractionRule[] {
  const found = doc.scene.interactions.find(
    (i) => i.hotspot === hotspotId && sameOn(i.on, on),
  );
  return found ? structuredClone(found.rules) : [];
}

export function emptyRule(): InteractionRule {
  return { when: [], do: [{ type: "say", text: "" }] };
}

export function emptyEditableAction(type: EditableActionType): ExploreAction {
  switch (type) {
    case "say":
      return { type: "say", text: "" };
    case "setSwitch":
      return { type: "setSwitch", id: "", value: true };
    case "giveItem":
      return { type: "giveItem", id: "" };
    case "takeItem":
      return { type: "takeItem", id: "" };
    case "call":
      return { type: "call", scene: "" };
    case "return":
      return { type: "return" };
    case "gotoScene":
      return { type: "gotoScene", scene: "" };
  }
}

export function emptySwitchPred(switchId = ""): Pred {
  return { switch: switchId, is: true };
}

/** Patch one action; keep siblings and unsupported entries intact. */
export function patchAction(
  rules: InteractionRule[],
  ruleIndex: number,
  actionIndex: number,
  next: ExploreAction,
): InteractionRule[] {
  return rules.map((r, ri) => {
    if (ri !== ruleIndex) return r;
    return {
      ...r,
      do: r.do.map((a, ai) => (ai === actionIndex ? next : a)),
    };
  });
}

export function patchPred(
  rules: InteractionRule[],
  ruleIndex: number,
  predIndex: number,
  next: Pred,
): InteractionRule[] {
  return rules.map((r, ri) => {
    if (ri !== ruleIndex) return r;
    return {
      ...r,
      when: r.when.map((p, pi) => (pi === predIndex ? next : p)),
    };
  });
}

export function addRule(rules: InteractionRule[]): InteractionRule[] {
  return [...rules, emptyRule()];
}

export function removeRule(rules: InteractionRule[], ruleIndex: number): InteractionRule[] {
  return rules.filter((_, i) => i !== ruleIndex);
}

export function addAction(
  rules: InteractionRule[],
  ruleIndex: number,
  type: EditableActionType = "say",
): InteractionRule[] {
  return rules.map((r, ri) => {
    if (ri !== ruleIndex) return r;
    return { ...r, do: [...r.do, emptyEditableAction(type)] };
  });
}

export function removeAction(
  rules: InteractionRule[],
  ruleIndex: number,
  actionIndex: number,
): InteractionRule[] {
  return rules.map((r, ri) => {
    if (ri !== ruleIndex) return r;
    const doNext = r.do.filter((_, ai) => ai !== actionIndex);
    return { ...r, do: doNext.length ? doNext : [{ type: "say", text: "" }] };
  });
}

export function addWhen(
  rules: InteractionRule[],
  ruleIndex: number,
  switchId = "",
): InteractionRule[] {
  return rules.map((r, ri) => {
    if (ri !== ruleIndex) return r;
    return { ...r, when: [...r.when, emptySwitchPred(switchId)] };
  });
}

export function removeWhen(
  rules: InteractionRule[],
  ruleIndex: number,
  predIndex: number,
): InteractionRule[] {
  return rules.map((r, ri) => {
    if (ri !== ruleIndex) return r;
    return { ...r, when: r.when.filter((_, pi) => pi !== predIndex) };
  });
}

export function actionChipLabel(a: ExploreAction): string {
  switch (a.type) {
    case "say":
      return `say「${a.text.slice(0, 24)}${a.text.length > 24 ? "…" : ""}」`;
    case "setSwitch":
      return `setSwitch ${a.id}=${a.value}`;
    case "giveItem":
      return `giveItem ${a.id}`;
    case "takeItem":
      return `takeItem ${a.id}`;
    case "call":
      return `call ${a.scene}${a.trans ? ` [${a.trans}]` : ""}`;
    case "return":
      return `return${a.trans ? ` [${a.trans}]` : ""}`;
    case "gotoScene":
      return `gotoScene ${a.scene}${a.trans ? ` [${a.trans}]` : ""}`;
    case "setVar":
      return `setVar ${a.id}=${a.value}`;
    case "addVar":
      return `addVar ${a.id}${a.delta >= 0 ? "+" : ""}${a.delta}`;
    case "playSe":
      return `playSe ${a.asset}`;
    case "bgm":
      return `bgm ${a.asset ?? "null"}`;
    case "fx":
      return `fx ${a.ref}`;
    case "showHotspot":
      return `showHotspot ${a.id}`;
    case "hideHotspot":
      return `hideHotspot ${a.id}`;
    case "enableHotspot":
      return `enableHotspot ${a.id}`;
    case "disableHotspot":
      return `disableHotspot ${a.id}`;
    default:
      return (a as ExploreAction).type
  }
}

export function predChipLabel(p: Pred): string {
  if ("switch" in p) return `開關 ${p.switch} = ${p.is}`;
  if ("var" in p) return `變數 ${p.var} = ${p.eq}`;
  if ("hasItem" in p) return `有物品 ${p.hasItem}`;
  return JSON.stringify(p);
}

/** Coalesce key for consecutive say text edits on same action slot. */
export function interactionCoalesceKey(
  hotspotId: string,
  on: InteractionOn,
  ruleIndex: number,
  actionIndex: number,
  field: string,
): string {
  const onPart = "verb" in on ? `v:${on.verb}` : `i:${on.item}`;
  return `ix:${hotspotId}:${onPart}:r${ruleIndex}:a${actionIndex}:${field}`;
}

export function hotspotNameCoalesceKey(hotspotId: string): string {
  return `hs-name:${hotspotId}`;
}

/** Patch one action in a flat list (e.g. scene.onEnter). */
export function patchActionInList(
  actions: ExploreAction[],
  actionIndex: number,
  next: ExploreAction,
): ExploreAction[] {
  return actions.map((a, i) => (i === actionIndex ? next : a));
}

export function addActionToList(
  actions: ExploreAction[],
  type: EditableActionType = "say",
): ExploreAction[] {
  return [...actions, emptyEditableAction(type)];
}

export function removeActionFromList(
  actions: ExploreAction[],
  actionIndex: number,
): ExploreAction[] {
  const next = actions.filter((_, i) => i !== actionIndex);
  return next.length ? next : [{ type: "say", text: "" }];
}

export function onEnterCoalesceKey(actionIndex: number, field: string): string {
  return `onEnter:a${actionIndex}:${field}`;
}

/** Compare project+scene only (ignore ui). */
export function sameProjectScene(a: ExploreDoc, b: ExploreDoc): boolean {
  return (
    JSON.stringify(a.project) === JSON.stringify(b.project) &&
    JSON.stringify(a.scene) === JSON.stringify(b.scene)
  );
}
