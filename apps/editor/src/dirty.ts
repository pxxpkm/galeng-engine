/** Thrown when leaving would drop edits that are still dirty after the save cap. */
export const LEAVE_CANCELLED_MESSAGE = "仍有未儲存變更，已取消離開";

const FLUSH_SAVE_LIMIT = 8;

/**
 * Save while dirty, then save again if a newer edit landed during the await.
 * `stillDirty` is required so a caller cannot compile with a default of "clean".
 * After {@link FLUSH_SAVE_LIMIT} saves that are still dirty, throw — callers
 * already skip `setSceneId` in their catch.
 */
export async function flushIfDirty(
  dirty: boolean,
  save: () => Promise<unknown>,
  stillDirty: () => boolean,
): Promise<"clean" | "saved"> {
  if (!dirty) {
    return "clean";
  }
  for (let attempt = 0; attempt < FLUSH_SAVE_LIMIT; attempt++) {
    await save();
    if (!stillDirty()) {
      return "saved";
    }
  }
  throw new Error(LEAVE_CANCELLED_MESSAGE);
}

/**
 * Flush, then read `stillDirty` again before the caller changes scene.
 * An edit that lands after the last in-loop check still cancels the leave.
 */
export async function flushThenAllowLeave(
  dirty: boolean,
  save: () => Promise<unknown>,
  stillDirty: () => boolean,
): Promise<"clean" | "saved"> {
  const status = await flushIfDirty(dirty, save, stillDirty);
  if (stillDirty()) {
    throw new Error(LEAVE_CANCELLED_MESSAGE);
  }
  return status;
}

/** True when a scene replace (including a duplicate callback) must not run. */
export function sceneLeaveBlocked(sceneDirty: boolean, projectDirty: boolean): boolean {
  return sceneDirty || projectDirty;
}

export function shouldWarnUnload(dirty: boolean): boolean {
  return dirty;
}

export function confirmDiscardIfDirty(
  dirty: boolean,
  message = "有未儲存變更，確定要丟棄並重載？",
  confirmFn: (msg: string) => boolean = (msg) =>
    typeof window !== "undefined" ? window.confirm(msg) : false,
): boolean {
  if (!dirty) return true;
  return confirmFn(message);
}
