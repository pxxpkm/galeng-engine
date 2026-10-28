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

/** The loaded document wins; otherwise the id selected while that file is still loading. */
export function sceneIsOpen(
  loadedId: string | null,
  selectedId: string | null,
  targetId: string,
): boolean {
  if (loadedId) return loadedId === targetId;
  return selectedId === targetId;
}

export type SceneRemovalDest =
  | { type: "stay" }
  | { type: "dialogue"; id: string }
  | { type: "explore"; id: string };

/**
 * Where the dialogue shell goes after `removedId` leaves the live list.
 * A different open scene stays, so an explore row can be removed without a shell change.
 */
export function sceneRemovalDestination(
  currentId: string | null,
  removedId: string,
  startScene: string,
  remainingIds: string[],
  kindOf: (id: string) => "dialogue" | "explore",
): SceneRemovalDest {
  if (currentId !== removedId) return { type: "stay" };
  const nextId = nextSceneAfterArchive(currentId, removedId, startScene, remainingIds);
  return { type: kindOf(nextId), id: nextId };
}

export function applySceneRemovalDestination(
  dest: SceneRemovalDest,
  nav: { openDialogue: (id: string) => void; openExplore: (id: string) => void },
): void {
  if (dest.type === "explore") nav.openExplore(dest.id);
  else if (dest.type === "dialogue") nav.openDialogue(dest.id);
}

export interface SceneRowMenuAction {
  id: "archive" | "delete";
  labelKey: string;
  titleKey: string;
  disabled: boolean;
}

/** Per-row archive / delete. The start scene stays disabled, with the reason as the title. */
export function sceneRowMenuActions(id: string, startScene: string | undefined): SceneRowMenuAction[] {
  const archiveOk = canArchiveScene(id, startScene);
  const deleteOk = canDeleteScene(id, startScene);
  return [
    {
      id: "archive",
      labelKey: "editor.archive",
      titleKey: archiveOk ? "editor.archiveTitle" : "editor.cannotArchiveStart",
      disabled: !archiveOk,
    },
    {
      id: "delete",
      labelKey: "editor.deleteScene",
      titleKey: deleteOk ? "editor.deleteSceneRowTitle" : "editor.cannotDeleteStart",
      disabled: !deleteOk,
    },
  ];
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
