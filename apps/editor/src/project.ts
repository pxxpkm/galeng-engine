import type {
  GalleryItem,
  PauseButtonKey,
  PauseButtons,
  Project,
  TitleButton,
  TitleButtonKey,
  TitleButtons,
} from "./types";
import { ensureGalleryItem } from "./beats";

export type OptionalPathKey = "titleBgm" | "titleBg" | "titleMovie" | "font" | "msgBox" | "icon";

export function setOptionalPath(project: Project, key: OptionalPathKey, raw: string): Project {
  const trimmed = raw.trim();
  const next = { ...project };
  if (!trimmed) {
    delete next[key];
  } else {
    next[key] = trimmed;
  }
  return next;
}

export function setSkipTitle(project: Project, on: boolean): Project {
  return { ...project, skipTitle: on };
}

export function setHideGameTitle(project: Project, on: boolean): Project {
  if (!on) {
    const next = { ...project };
    delete next.hideGameTitle;
    return next;
  }
  return { ...project, hideGameTitle: true };
}

function compactTitleButton(btn: TitleButton): TitleButton | undefined {
  const next: TitleButton = {};
  if (btn.label !== undefined) {
    next.label = btn.label;
  }
  if (btn.image?.trim()) {
    next.image = btn.image.trim();
  }
  if (btn.hover?.trim()) {
    next.hover = btn.hover.trim();
  }
  if (btn.x !== undefined) {
    next.x = btn.x;
  }
  if (btn.y !== undefined) {
    next.y = btn.y;
  }
  if (btn.w !== undefined && btn.w >= 1) {
    next.w = btn.w;
  }
  if (btn.h !== undefined && btn.h >= 1) {
    next.h = btn.h;
  }
  if (next.image && next.label === undefined) {
    next.label = "";
  }
  if (!next.image && next.label === "") {
    delete next.label;
  }
  if (
    next.label === undefined &&
    !next.image &&
    !next.hover &&
    next.x === undefined &&
    next.y === undefined &&
    next.w === undefined &&
    next.h === undefined
  ) {
    return undefined;
  }
  return next;
}

export function setTitleButton(
  project: Project,
  key: TitleButtonKey,
  patch: TitleButton,
): Project {
  const merged: TitleButton = { ...project.titleButtons?.[key], ...patch };
  const compact = compactTitleButton(merged);
  const buttons: TitleButtons = { ...project.titleButtons };
  if (!compact) {
    delete buttons[key];
  } else {
    buttons[key] = compact;
  }
  if (Object.keys(buttons).length === 0) {
    const next = { ...project };
    delete next.titleButtons;
    return next;
  }
  return { ...project, titleButtons: buttons };
}

export function setPauseButton(
  project: Project,
  key: PauseButtonKey,
  patch: TitleButton,
): Project {
  const merged: TitleButton = { ...project.pauseButtons?.[key], ...patch };
  const compact = compactTitleButton(merged);
  const buttons: PauseButtons = { ...project.pauseButtons };
  if (!compact) {
    delete buttons[key];
  } else {
    buttons[key] = compact;
  }
  if (Object.keys(buttons).length === 0) {
    const next = { ...project };
    delete next.pauseButtons;
    return next;
  }
  return { ...project, pauseButtons: buttons };
}

export function setMusicGallery(project: Project, musicGallery: GalleryItem[]): Project {
  return { ...project, musicGallery };
}

export function addMusicItem(project: Project): Project {
  const n = (project.musicGallery?.length ?? 0) + 1;
  return {
    ...project,
    musicGallery: [...(project.musicGallery ?? []), { id: `bgm_${n}`, asset: "bgm/track" }],
  };
}

export function applyMusicAsset(project: Project, asset: string): Project {
  return { ...project, musicGallery: ensureGalleryItem(project.musicGallery, asset) };
}
