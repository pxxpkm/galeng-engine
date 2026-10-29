/**
 * Whether an in-flight scene GET must keep the open document.
 * Only the scene document counts. A dirty project does not replace or block
 * that load: switching scenes does not write the project.
 */
export function sceneLoadKeptForSceneEdit(args: {
  /** Id of the document still open. Null after a confirmed delete clears it. */
  openSceneId: string | null;
  loadedSceneRev: number;
  sceneRev: number;
  sceneDirty: boolean;
}): boolean {
  if (args.openSceneId == null) return false;
  return args.sceneRev !== args.loadedSceneRev || args.sceneDirty;
}

/** Set when archive, duplicate, or new scene has already chosen the next id. */
export type DepartedSceneTicket = { from: string; to: string };

export function departureTicket(
  from: string | null | undefined,
  to: string | null | undefined,
): DepartedSceneTicket | null {
  if (!from || !to || from === to) return null;
  return { from, to };
}

/**
 * The scene a completed GET may restore, when this request is the navigation
 * that left it. A ticket for a different destination does not count.
 */
export function departedSceneForLoad(
  ticket: DepartedSceneTicket | null,
  sceneId: string,
): string | null {
  if (ticket == null || ticket.to !== sceneId) return null;
  return ticket.from;
}

/**
 * True when writing this id would recreate a scene that already left.
 * An empty live list is unknown, not proof of removal. A departure ticket
 * still counts, so copy and new scene are covered while the old id stays listed.
 */
export function sceneDocumentHasLeft(args: {
  sceneId: string;
  liveSceneIds: readonly string[];
  departedSceneId: string | null;
}): boolean {
  if (args.departedSceneId != null && args.departedSceneId === args.sceneId) return true;
  if (args.liveSceneIds.length === 0) return false;
  return !args.liveSceneIds.includes(args.sceneId);
}

export type SceneLoadPlan = {
  /** Replace the open document with the GET body. */
  apply: boolean;
  /** On failure, select the open id again. False when that id has left. */
  restoreOpen: boolean;
};

/**
 * Bounce only when the open scene itself changed and that id is still a live
 * scene the user did not already leave. Otherwise apply the response, and do
 * not restore an archived or departed id if the GET fails.
 */
export function planSceneLoad(args: {
  openSceneId: string | null;
  loadedSceneRev: number;
  sceneRev: number;
  sceneDirty: boolean;
  liveSceneIds: readonly string[];
  departedSceneId: string | null;
}): SceneLoadPlan {
  const openId = args.openSceneId;
  const restorable =
    openId != null &&
    !sceneDocumentHasLeft({
      sceneId: openId,
      liveSceneIds: args.liveSceneIds,
      departedSceneId: args.departedSceneId,
    });
  if (sceneLoadKeptForSceneEdit(args) && restorable) {
    return { apply: false, restoreOpen: true };
  }
  return { apply: true, restoreOpen: openId == null || restorable };
}
