import type { PauseButtonKey, TitleButton, TitleButtonKey } from "./types";
import { TITLE_BUTTON_KEYS } from "./types";

/** Match `default_title_rect` in crates/player/src/title.rs */
export const TITLE_STAGE_W = 1920;
export const TITLE_STAGE_H = 1080;
export const TITLE_SNAP_PX = 8;

export type TitleRect = { x: number; y: number; w: number; h: number };

export function defaultTitleRect(index: number): TitleRect {
  return { x: 660, y: 400 + index * 68, w: 600, h: 56 };
}

export function titleButtonIndex(key: TitleButtonKey): number {
  return TITLE_BUTTON_KEYS.indexOf(key);
}

export function defaultPauseRect(index: number): TitleRect {
  return { x: 660, y: 200 + index * 60, w: 600, h: 52 };
}

export function resolvedButtonRect(
  fallback: TitleRect,
  btn?: TitleButton,
  imageWh?: { w: number; h: number },
): TitleRect {
  return {
    x: btn?.x ?? fallback.x,
    y: btn?.y ?? fallback.y,
    w: btn?.w ?? imageWh?.w ?? fallback.w,
    h: btn?.h ?? imageWh?.h ?? fallback.h,
  };
}

export function resolvedTitleRect(
  index: number,
  btn?: TitleButton,
  imageWh?: { w: number; h: number },
): TitleRect {
  return resolvedButtonRect(defaultTitleRect(index), btn, imageWh);
}

export function previewScale(previewW: number): number {
  if (previewW <= 0) {
    return 0;
  }
  return previewW / TITLE_STAGE_W;
}

export function stageToPreview(n: number, scale: number): number {
  return n * scale;
}

export function previewToStage(n: number, scale: number): number {
  if (scale <= 0) {
    return 0;
  }
  return Math.round(n / scale);
}

export function snapCoord(value: number, guides: number[], threshold = TITLE_SNAP_PX): number {
  let best = value;
  let bestDist = threshold + 1;
  for (const guide of guides) {
    const dist = Math.abs(value - guide);
    if (dist <= threshold && dist < bestDist) {
      best = guide;
      bestDist = dist;
    }
  }
  return best;
}

export function snapPosition(
  x: number,
  y: number,
  others: { x: number; y: number }[],
  threshold = TITLE_SNAP_PX,
): { x: number; y: number } {
  return {
    x: snapCoord(
      x,
      others.map((item) => item.x),
      threshold,
    ),
    y: snapCoord(
      y,
      others.map((item) => item.y),
      threshold,
    ),
  };
}

export function titleDefaultLabels(locale: string): Record<TitleButtonKey, string> {
  if (locale === "en") {
    return {
      newGame: "New game",
      continue: "Continue",
      load: "Load…",
      gallery: "CG",
      music: "Music",
      settings: "Settings",
      quit: "Quit",
    };
  }
  if (locale === "zh-Hans") {
    return {
      newGame: "开始游戏",
      continue: "继续",
      load: "读档…",
      gallery: "CG 回顾",
      music: "音乐回顾",
      settings: "设置",
      quit: "离开",
    };
  }
  return {
    newGame: "開始遊戲",
    continue: "繼續",
    load: "讀檔…",
    gallery: "CG 回想",
    music: "音樂回想",
    settings: "設定",
    quit: "離開",
  };
}

export function titleCaption(locale: string, key: TitleButtonKey, btn?: TitleButton): string {
  if (btn?.label !== undefined) {
    return btn.label;
  }
  return titleDefaultLabels(locale)[key];
}

export function pauseDefaultLabels(locale: string): Record<PauseButtonKey, string> {
  if (locale === "en") {
    return {
      continue: "Continue",
      quickSave: "Quick save",
      quickLoad: "Quick load",
      autoLoad: "Auto load",
      save: "Save…",
      load: "Load…",
      settings: "Settings",
      title: "Title",
      quit: "Quit",
    };
  }
  if (locale === "zh-Hans") {
    return {
      continue: "继续",
      quickSave: "快速存档",
      quickLoad: "快速读档",
      autoLoad: "自动读档",
      save: "存档…",
      load: "读档…",
      settings: "设置",
      title: "回标题",
      quit: "离开",
    };
  }
  return {
    continue: "繼續",
    quickSave: "快速存檔",
    quickLoad: "快速讀檔",
    autoLoad: "自動讀檔",
    save: "存檔…",
    load: "讀檔…",
    settings: "設定",
    title: "回標題",
    quit: "離開",
  };
}

export function pauseCaption(locale: string, key: PauseButtonKey, btn?: TitleButton): string {
  if (btn?.label !== undefined) {
    return btn.label;
  }
  return pauseDefaultLabels(locale)[key];
}
