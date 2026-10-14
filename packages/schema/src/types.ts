export type UiLanguage = "zh-Hans" | "zh-Hant" | "en";

export type Slot = "left" | "center" | "right";

export type Trans = "none" | "fade" | "crossfade";

/** Logical asset path: no extension, no drive letter. */
export type AssetPath = string;

/** v1: integer overwrite, boolean 0/1, or relative "+N"/"-N". No string vars. */
export type SetValue = number | boolean | string;

export type ConditionPred =
  | boolean
  | number
  | string
  | {
      gte?: number;
      lte?: number;
      gt?: number;
      lt?: number;
      eq?: unknown;
      ne?: unknown;
    };

export type Condition = Record<string, ConditionPred>;

export type AutoAdvance =
  | { type: "voice" }
  | { type: "ms"; ms: number };

export interface Resolution {
  width: 1920;
  height: 1080;
}

export interface Character {
  id: string;
  display?: Record<string, string>;
  /** Percent of typewriter delay. 100 = default. */
  textRate?: number;
}

export interface GalleryItem {
  id: string;
  asset: AssetPath;
}

export type TitleButtonKey =
  | "newGame"
  | "continue"
  | "load"
  | "gallery"
  | "music"
  | "settings"
  | "quit";

export interface TitleButton {
  label?: string;
  image?: AssetPath;
  hover?: AssetPath;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export type TitleButtons = Partial<Record<TitleButtonKey, TitleButton>>;

export type PauseButtonKey =
  | "continue"
  | "quickSave"
  | "quickLoad"
  | "autoLoad"
  | "save"
  | "load"
  | "settings"
  | "title"
  | "quit";

export type PauseButtons = Partial<Record<PauseButtonKey, TitleButton>>;

export type SceneKind = "dialogue" | "explore";

export type EffectKind = "fade" | "crossfade";

export interface EffectParams {
  ms?: number;
  color?: string;
}

export interface Verb {
  id: string;
  label: string;
  builtin?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  /** Logical asset path, no extension. */
  icon?: AssetPath;
  desc?: string;
  consumeOnUse?: boolean;
}

export interface SwitchDef {
  id: string;
  name?: string;
  /** Omitted means false. */
  init?: boolean;
}

export interface Fallback {
  perVerb?: Record<string, string>;
  itemOnHotspot?: string;
  global?: string;
}

export interface EffectDef {
  id: string;
  kind: EffectKind;
  params?: EffectParams;
}

export interface TransitionDefaults {
  toDialogue?: string;
  fromDialogue?: string;
  gotoScene?: string;
}

export interface Project {
  id: string;
  title: string;
  schemaVersion: 1 | 2;
  resolution: Resolution;
  startScene: string;
  locale: string;
  skipTitle?: boolean;
  titleBgm?: AssetPath;
  titleBg?: AssetPath;
  titleMovie?: AssetPath;
  /** Logical path under fonts/, e.g. fonts/mplus. Empty = system font. */
  font?: AssetPath;
  /** Dialogue-box skin. Stretched to the engine MSG rect. */
  msgBox?: AssetPath;
  /** Exe / window icon. File is assets/<path>.ico or .png. */
  icon?: AssetPath;
  /** Hide the project name drawn above the title buttons. */
  hideGameTitle?: boolean;
  titleButtons?: TitleButtons;
  pauseButtons?: PauseButtons;
  uiLanguages?: UiLanguage[];
  characters?: Character[];
  cg?: GalleryItem[];
  musicGallery?: GalleryItem[];
  verbs?: Verb[];
  items?: ItemDef[];
  switches?: SwitchDef[];
  fallback?: Fallback;
  effectLibrary?: EffectDef[];
  transitionDefaults?: TransitionDefaults;
}

export interface Bg {
  asset: AssetPath;
  trans?: Trans;
  ms?: number;
}

export interface CharOnStage {
  id: string;
  face: string;
  slot?: Slot;
  /** Pixels from the slot. 0 / omitted = on the slot. */
  x?: number;
  y?: number;
  /** Slide to this pose from the previous beat. 0 / omitted = hard cut. */
  slideMs?: number;
}

export interface Say {
  speaker: string;
  text: string;
  voice?: AssetPath;
  autoAdvance?: AutoAdvance;
}

export interface Bgm {
  asset: AssetPath | null;
  fadeMs?: number;
}

export interface Se {
  asset: AssetPath;
}

export interface Fx {
  type: "fade" | "shake" | "wait" | "flash";
  ms?: number;
}

export interface Movie {
  asset: AssetPath;
}

export interface Camera {
  x?: number;
  y?: number;
  /** Percent. 100 = identity. 50–400. */
  zoom?: number;
}

export interface Beat {
  bg?: Bg;
  chars?: CharOnStage[];
  say?: Say;
  bgm?: Bgm;
  se?: Se[];
  /** Looping ambience. null = stop. Omitted = inherit in this scene. */
  amb?: AssetPath | null;
  fx?: Fx;
  movie?: Movie;
  /** Scene camera. null = identity. Omitted = inherit in this scene. */
  camera?: Camera | null;
  cg?: AssetPath | null;
  set?: Record<string, SetValue>;
  label?: string;
}

export interface ChoiceOption {
  text: string;
  goto: string;
  set?: Record<string, SetValue>;
  if?: Condition;
}

export type Exit =
  | { type: "next"; goto: string }
  | { type: "choices"; options: ChoiceOption[] }
  | { type: "branch"; if: Condition; then: string; else: string }
  | { type: "call"; scene: string; trans?: string }
  | { type: "return"; trans?: string };

export type HotspotShape =
  | { type: "rect"; x: number; y: number; w: number; h: number }
  | { type: "polygon"; points: [number, number][] };

/** AND atom. Untagged object, not a `type` tag. */
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
  | { type: "playSe"; asset: AssetPath }
  | { type: "bgm"; asset: AssetPath | null; fadeMs?: number }
  | { type: "fx"; ref: string; override?: EffectParams }
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

export interface Hotspot {
  id: string;
  name: string;
  shape: HotspotShape;
  visibleIf?: Pred[] | null;
  enabledIf?: Pred[] | null;
  defaultVerb?: string;
}

export interface Scene {
  id: string;
  title?: string;
  /** Omitted means dialogue. */
  sceneKind?: SceneKind;
  /** Explore plate. Dialogue scenes keep per-beat `bg`. */
  bg?: Bg;
  /** Omitted means []. */
  beats?: Beat[];
  hotspots?: Hotspot[];
  interactions?: Interaction[];
  onEnter?: ExploreAction[];
  exit?: Exit;
}
