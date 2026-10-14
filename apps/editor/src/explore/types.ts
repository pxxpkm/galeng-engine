/** Explore editor document types — aligned with @galeng/schema Explore IR. */

export type SceneKind = "dialogue" | "explore";

export type Pred =
  | { switch: string; is: boolean }
  | { var: string; eq: number }
  | { hasItem: string };

export type InteractionOn = { verb: string } | { item: string };

export type ExploreAction =
  | { type: "say"; text: string; speaker?: string }
  | { type: "setSwitch"; id: string; value: boolean }
  | { type: "setVar"; id: string; value: number }
  | { type: "addVar"; id: string; delta: number }
  | { type: "giveItem"; id: string }
  | { type: "takeItem"; id: string }
  | { type: "gotoScene"; scene: string; trans?: string }
  | { type: "call"; scene: string; trans?: string }
  | { type: "return"; trans?: string }
  | { type: "playSe"; asset: string }
  | { type: "bgm"; asset: string | null; fadeMs?: number }
  | { type: "fx"; ref: string; override?: { ms?: number; color?: string } }
  | { type: "showHotspot"; id: string }
  | { type: "hideHotspot"; id: string }
  | { type: "enableHotspot"; id: string }
  | { type: "disableHotspot"; id: string };

export interface InteractionRule {
  when: Pred[];
  do: ExploreAction[];
}

export interface Interaction {
  hotspot: string;
  on: InteractionOn;
  rules: InteractionRule[];
}

export type HotspotShape =
  | { type: "rect"; x: number; y: number; w: number; h: number }
  | { type: "polygon"; points: [number, number][] };

export interface Hotspot {
  id: string;
  name: string;
  shape: HotspotShape;
  visibleIf?: Pred[] | null;
  enabledIf?: Pred[] | null;
  defaultVerb?: string;
}

export interface Verb {
  id: string;
  label: string;
  builtin?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  icon?: string;
  desc?: string;
  consumeOnUse?: boolean;
}

export interface SwitchDef {
  id: string;
  name?: string;
  init?: boolean;
}

export interface CharacterDef {
  id: string;
  display?: Record<string, string>;
  textRate?: number;
}

export interface Fallback {
  perVerb?: Record<string, string>;
  itemOnHotspot?: string;
  global?: string;
}

/** E1-min effect library entry (fade / crossfade). */
export interface EffectDef {
  id: string;
  kind: "fade" | "crossfade";
  params?: { ms?: number; color?: string };
}

export interface TransitionDefaults {
  toDialogue?: string;
  fromDialogue?: string;
  gotoScene?: string;
}

/** Optional catalog entry for Problems / Call scene picker. */
export interface SceneCatalogEntry {
  id: string;
  kind: SceneKind;
  /** Dialogue that exits with return; false = dead-end for Call. */
  hasReturn?: boolean;
  title?: string;
}

export interface ExploreProject {
  id: string;
  title: string;
  schemaVersion: number;
  resolution: { width: number; height: number };
  startScene: string;
  locale: string;
  verbs: Verb[];
  items: ItemDef[];
  switches: SwitchDef[];
  characters: CharacterDef[];
  fallback: Fallback;
  effectLibrary?: EffectDef[];
  transitionDefaults?: TransitionDefaults;
}

export interface ExploreScene {
  id: string;
  title?: string;
  sceneKind: "explore";
  bg?: { asset: string; trans?: string; ms?: number };
  hotspots: Hotspot[];
  interactions: Interaction[];
  onEnter?: ExploreAction[];
}

export type CanvasTool = "select" | "drawRect";

export interface ExploreUi {
  selectedHotspotId: string | null;
  /** Selected matrix cell; Inspector shows its rules. */
  selectedCell: { hotspotId: string; on: InteractionOn } | null;
  canvasTool: CanvasTool;
  /** Clipboard for matrix cell copy/paste. */
  clipboardRules: InteractionRule[] | null;
}

export interface ExploreDoc {
  project: ExploreProject;
  scene: ExploreScene;
  ui: ExploreUi;
  /** Raw host project JSON (lossless round-trip for non-Explore fields). */
  _rawProject?: Record<string, unknown>;
  /** Raw host scene JSON (lossless round-trip for exit / unknown keys). */
  _rawScene?: Record<string, unknown>;
}

export function emptyUi(): ExploreUi {
  return {
    selectedHotspotId: null,
    selectedCell: null,
    canvasTool: "select",
    clipboardRules: null,
  };
}

export function cloneDoc(doc: ExploreDoc): ExploreDoc {
  return structuredClone(doc);
}

export function onKey(on: InteractionOn): string {
  return "verb" in on ? `verb:${on.verb}` : `item:${on.item}`;
}

export function sameOn(a: InteractionOn, b: InteractionOn): boolean {
  return onKey(a) === onKey(b);
}

export const BUILTIN_VERBS: Verb[] = [
  { id: "look", label: "看", builtin: true },
  { id: "talk", label: "講", builtin: true },
  { id: "take", label: "拎", builtin: true },
  { id: "use", label: "用", builtin: true },
  { id: "open", label: "開", builtin: true },
  { id: "move", label: "去", builtin: true },
];

