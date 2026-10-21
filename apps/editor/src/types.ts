export type Locale = "zh-Hant" | "zh-Hans" | "en";

export interface Character {
  id: string;
  display?: Record<string, string>;
  textRate?: number;
}

export interface GalleryItem {
  id: string;
  asset: string;
}

export const TITLE_BUTTON_KEYS = [
  "newGame",
  "continue",
  "load",
  "gallery",
  "music",
  "settings",
  "quit",
] as const;

export type TitleButtonKey = (typeof TITLE_BUTTON_KEYS)[number];

export interface TitleButton {
  label?: string;
  image?: string;
  hover?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export type TitleButtons = Partial<Record<TitleButtonKey, TitleButton>>;

export const PAUSE_BUTTON_KEYS = [
  "continue",
  "quickSave",
  "quickLoad",
  "autoLoad",
  "save",
  "load",
  "settings",
  "title",
  "quit",
] as const;

export type PauseButtonKey = (typeof PAUSE_BUTTON_KEYS)[number];

export type PauseButtons = Partial<Record<PauseButtonKey, TitleButton>>;

export interface FontScale {
  dialogueBody?: number;
  speaker?: number;
  explorePill?: number;
  inventory?: number;
  hud?: number;
  title?: number;
  menu?: number;
  settings?: number;
}

export interface FontConfig {
  dialogue?: string;
  ui?: string;
  title?: string;
  scale?: FontScale;
}

export interface Project {
  id: string;
  title: string;
  schemaVersion?: number;
  resolution?: { width: number; height: number };
  startScene: string;
  locale: string;
  skipTitle?: boolean;
  titleBgm?: string;
  titleBg?: string;
  titleMovie?: string;
  /** @deprecated Prefer fonts.dialogue */
  font?: string;
  fonts?: FontConfig;
  msgBox?: string;
  icon?: string;
  hideGameTitle?: boolean;
  titleButtons?: TitleButtons;
  pauseButtons?: PauseButtons;
  uiLanguages?: string[];
  characters?: Character[];
  cg?: GalleryItem[];
  musicGallery?: GalleryItem[];
}

export type AssetRootInfo = {
  path: string;
  isDefault: boolean;
};

export interface AssetMeta {
  logical: string;
  kind: string;
}

export interface CharOnStage {
  id: string;
  face: string;
  slot?: "left" | "center" | "right";
  x?: number;
  y?: number;
  slideMs?: number;
}

export interface Beat {
  bg?: { asset: string; trans?: string; ms?: number };
  chars?: CharOnStage[];
  say?: {
    speaker: string;
    text: string;
    voice?: string;
    autoAdvance?: { type: "voice" } | { type: "ms"; ms: number };
  };
  bgm?: { asset: string | null; fadeMs?: number };
  se?: { asset: string }[];
  amb?: string | null;
  fx?: { type: "fade" | "shake" | "wait" | "flash"; ms?: number };
  movie?: { asset: string };
  camera?: { x?: number; y?: number; zoom?: number } | null;
  cg?: string | null;
  set?: Record<string, string | number | boolean>;
  label?: string;
  /** Stable identity. Pattern ^b[0-9a-f]{16}$. */
  id?: string;
}

export interface ChoiceOption {
  text: string;
  goto: string;
  set?: Record<string, string | number | boolean>;
  if?: Record<string, unknown>;
}

export type Exit =
  | { type: "next"; goto: string }
  | { type: "choices"; options: ChoiceOption[] }
  | { type: "branch"; if: unknown; then: string; else: string }
  | { type: "call"; scene: string; trans?: string }
  | { type: "return"; trans?: string }
  | { type: "end" };

export interface SceneMeta {
  id: string;
  title?: string;
  exit?: Exit;
}

export interface Scene {
  id: string;
  title?: string;
  /** Present on schema v2; omitted → infer from hotspots. */
  sceneKind?: "dialogue" | "explore";
  beats: Beat[];
  exit?: Exit;
  hotspots?: unknown[];
  interactions?: unknown[];
}
