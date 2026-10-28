import { flushIfDirty } from "./dirty";

/** Active dialogue/explore (or classic) shell registers here so hash swaps can flush. */
export type ShellSession = {
  getDirty: () => boolean;
  save: () => Promise<unknown>;
};

let session: ShellSession | null = null;

export function registerShellSession(next: ShellSession): () => void {
  session = next;
  return () => {
    if (session === next) session = null;
  };
}

/** Test helper — clear registration between cases. */
export function _resetShellSessionForTests(): void {
  session = null;
}

const SAVE_FAIL =
  "無法儲存未存變更，已取消切換編輯器。請先修正錯誤後再試。";
const STILL_DIRTY =
  "仍有未儲存變更（儲存可能被驗證擋下），已取消切換編輯器。";

/**
 * Before leaving the current shell (#explore ↔ #dialogue, or reload for classic↔v2):
 * auto-save when dirty. Returns false if save failed or dirty remains — caller aborts navigation.
 */
export async function ensureShellCleanForLeave(
  alertFn: (msg: string) => void = (msg) => {
    if (typeof window !== "undefined") window.alert(msg);
  },
): Promise<boolean> {
  const active = session;
  if (!active || !active.getDirty()) {
    return true;
  }
  try {
    await flushIfDirty(true, active.save, () => active.getDirty());
  } catch (err) {
    alertFn(err instanceof Error ? `${SAVE_FAIL}\n${err.message}` : SAVE_FAIL);
    return false;
  }
  if (active.getDirty()) {
    alertFn(STILL_DIRTY);
    return false;
  }
  return true;
}
