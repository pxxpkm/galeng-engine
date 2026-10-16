import { assetGroupOf, assetLists } from "./assets";
import type { AssetMeta, GalleryItem, Project } from "./types";

/** Filter chips for the Audio Manager library list. */
export const AUDIO_KIND_FILTERS = ["all", "bgm", "se", "amb", "voice"] as const;
export type AudioKindFilter = (typeof AUDIO_KIND_FILTERS)[number];

export type AudioKind = Exclude<AudioKindFilter, "all">;

/** Map a logical path to an audio kind, or null if not under bgm/se/amb/voice. */
export function audioKindOf(logical: string): AudioKind | null {
  const group = assetGroupOf(logical.trim());
  if (group === "bgm" || group === "se" || group === "amb" || group === "voice") {
    return group;
  }
  return null;
}

/**
 * List audio logical paths from scanned assets, optionally filtered by kind.
 * Order: bgm → se → amb → voice (stable within each prefix as scanned).
 */
export function listAudioLogicals(
  assets: AssetMeta[],
  filter: AudioKindFilter = "all",
): string[] {
  const lists = assetLists(assets);
  if (filter === "all") {
    return [...lists.bgm, ...lists.se, ...lists.amb, ...lists.voice];
  }
  return lists[filter];
}

/** Replace one music-gallery row by index (no-op if out of range). */
export function patchMusicGalleryItem(
  project: Project,
  index: number,
  item: GalleryItem,
): Project {
  const music = project.musicGallery ?? [];
  if (index < 0 || index >= music.length) {
    return project;
  }
  const next = music.slice();
  next[index] = { id: item.id, asset: item.asset };
  return { ...project, musicGallery: next };
}

/** Remove one music-gallery row by index. */
export function removeMusicGalleryItem(project: Project, index: number): Project {
  const music = project.musicGallery ?? [];
  if (index < 0 || index >= music.length) {
    return project;
  }
  return { ...project, musicGallery: music.filter((_, i) => i !== index) };
}

/** Cite count lookup from overview rows (logical → count). */
export function citeCountMap(
  rows: Iterable<{ logical: string; count: number }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    out.set(row.logical, row.count);
  }
  return out;
}
