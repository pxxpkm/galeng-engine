/**
 * Archive / delete a scene by id.
 * The open scene keeps the previous dirty rules: archive flushes, delete confirms
 * and drops that scene's buffer. Any other id only refreshes the list, so an
 * explore room can be removed without entering the Explore shell.
 */
import { LEAVE_CANCELLED_MESSAGE } from "./dirty";
import { listedKindOf } from "./editorRoute";
import {
  applySceneRemovalDestination,
  canArchiveScene,
  canDeleteScene,
  sceneRemovalDestination,
} from "./scene";
import type { SceneMeta } from "./types";

export interface ArchiveSceneDeps {
  startScene: string | undefined;
  /** Id open in this shell, or null when nothing is selected. */
  currentId: string | null;
  cannot: string;
  flushIfCurrent: () => Promise<unknown>;
  stillBlocked: () => boolean;
  archive: (id: string) => Promise<unknown>;
  loadLive: () => Promise<SceneMeta[]>;
  loadArchived: () => Promise<SceneMeta[]>;
  setLive: (rows: SceneMeta[]) => void;
  setArchived: (rows: SceneMeta[]) => void;
  openDialogue: (id: string) => void;
  openExplore: (id: string) => void;
}

export async function runArchiveScene(id: string, deps: ArchiveSceneDeps): Promise<void> {
  if (!deps.startScene || !canArchiveScene(id, deps.startScene)) {
    throw new Error(deps.cannot);
  }
  const leaving = deps.currentId === id;
  if (leaving) {
    await deps.flushIfCurrent();
  }
  await deps.archive(id);
  const [live, hidden] = await Promise.all([deps.loadLive(), deps.loadArchived()]);
  deps.setLive(live);
  deps.setArchived(hidden);
  if (!leaving) return;
  if (deps.stillBlocked()) {
    throw new Error(LEAVE_CANCELLED_MESSAGE);
  }
  applySceneRemovalDestination(
    sceneRemovalDestination(
      id,
      id,
      deps.startScene,
      live.map((item) => item.id),
      (next) => listedKindOf(live, next),
    ),
    { openDialogue: deps.openDialogue, openExplore: deps.openExplore },
  );
}

export interface DeleteSceneDeps {
  startScene: string | undefined;
  cannot: string;
  confirm: (id: string) => boolean;
  isOpen: (id: string) => boolean;
  loadedId: () => string | null;
  /** False when a delete is already in flight. */
  tryBegin: (id: string) => boolean;
  end: () => void;
  ignoreInFlightSaves: () => void;
  deleteFile: (id: string) => Promise<unknown>;
  /** Drop the loaded document. Must clear `loadedId` before returning. */
  clearLoaded: () => void;
  clearBackup: (id: string) => void;
  dropFromList: (id: string) => void;
  loadLive: () => Promise<SceneMeta[]>;
  setLive: (rows: SceneMeta[]) => void;
  openDialogue: (id: string) => void;
  openExplore: (id: string) => void;
}

export async function runDeleteScene(id: string, deps: DeleteSceneDeps): Promise<void> {
  if (!deps.startScene || !canDeleteScene(id, deps.startScene)) {
    throw new Error(deps.cannot);
  }
  if (!deps.confirm(id)) return;
  if (!deps.tryBegin(id)) return;
  const removingOpen = deps.isOpen(id);
  if (removingOpen) deps.ignoreInFlightSaves();
  try {
    await deps.deleteFile(id);
    if (deps.loadedId() === id) deps.clearLoaded();
    deps.clearBackup(id);
    deps.dropFromList(id);
    const live = await deps.loadLive();
    deps.setLive(live);
    const loadedAfter = deps.loadedId();
    // Stay when another scene is loaded, including one opened during the request.
    if (removingOpen && (loadedAfter == null || loadedAfter === id)) {
      applySceneRemovalDestination(
        sceneRemovalDestination(
          id,
          id,
          deps.startScene,
          live.map((item) => item.id),
          (next) => listedKindOf(live, next),
        ),
        { openDialogue: deps.openDialogue, openExplore: deps.openExplore },
      );
    }
  } finally {
    deps.end();
  }
}
