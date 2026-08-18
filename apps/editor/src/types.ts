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
  font?: string;
  msgBox?: string;
  icon?: string;
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
  | { type: "branch"; if: unknown; then: string; else: string };

export interface SceneMeta {
  id: string;
  title?: string;
  exit?: Exit;
}

export interface Scene {
  id: string;
  title?: string;
  beats: Beat[];
  exit?: Exit;
}
