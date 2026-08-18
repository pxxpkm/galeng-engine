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

export interface Project {
  id: string;
  title: string;
  schemaVersion: 1;
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
  uiLanguages?: UiLanguage[];
  characters?: Character[];
  cg?: GalleryItem[];
  musicGallery?: GalleryItem[];
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
  | { type: "branch"; if: Condition; then: string; else: string };

export interface Scene {
  id: string;
  title?: string;
  beats: Beat[];
  exit?: Exit;
}
