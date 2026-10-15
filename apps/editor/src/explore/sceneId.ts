import { parseSceneId } from "../goto";

/**
 * Validate a new Explore scene id before hitting the host.
 * Returns a Traditional Chinese error, or null if ok.
 */
export function exploreNewSceneIdError(
  raw: string,
  existingIds: Iterable<string>,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "場景 ID 不可為空";
  if (!parseSceneId(trimmed)) {
    return "場景 ID 僅可含英數、底線與連字號（A–Z、a–z、0–9、_、-）";
  }
  for (const id of existingIds) {
    if (id === trimmed) return `場景「${trimmed}」已存在於目錄`;
  }
  return null;
}

/** Parsed id if valid and not duplicate; else null (see exploreNewSceneIdError). */
export function parseNewExploreSceneId(
  raw: string,
  existingIds: Iterable<string>,
): string | null {
  if (exploreNewSceneIdError(raw, existingIds)) return null;
  return parseSceneId(raw);
}
