/**
 * A save response may arrive after the user has edited again.
 * Apply the server body, and clear dirty, only when nothing newer was committed locally.
 */
export function mergeSaveResponse<T>(input: {
  requestRev: number;
  currentRev: number;
  saved: T;
  current: T;
}): { value: T; clearDirty: boolean } {
  if (input.requestRev !== input.currentRev) {
    return { value: input.current, clearDirty: false };
  }
  return { value: input.saved, clearDirty: true };
}
