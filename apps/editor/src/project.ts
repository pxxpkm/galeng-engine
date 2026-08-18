import type { GalleryItem, Project } from "./types";
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
