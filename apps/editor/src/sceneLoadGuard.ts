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
