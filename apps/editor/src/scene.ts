import { parseSceneId } from "./goto";
import type { Scene } from "./types";

export function canArchiveScene(id: string, startScene: string | undefined): boolean {
  return Boolean(id) && Boolean(startScene) && id !== startScene;
}

export function canDeleteScene(id: string, startScene: string | undefined): boolean {
  return canArchiveScene(id, startScene);
}

/** After archiving `archived`, where should the editor go. */
export function nextSceneAfterArchive(
  current: string,
  archived: string,
  startScene: string,
  remaining: string[],
): string {
  if (current !== archived) {
    return current;
  }
  if (remaining.includes(startScene)) {
    return startScene;
  }
  return remaining[0] ?? startScene;
}

/** Deep-copy beats / exit / title under a new legal id. Same id or bad id → null. */
export function duplicateScene(source: Scene, rawId: string): Scene | null {
  const id = parseSceneId(rawId);
  if (!id || id === source.id) {
    return null;
  }
  const copy = structuredClone(source);
  copy.id = id;
  return copy;
}
