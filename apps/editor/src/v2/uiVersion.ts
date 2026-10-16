import { ensureShellCleanForLeave } from "../shellGate";

export type UiVersion = "classic" | "v2";

const KEY = "galeng.uiVersion";

/** Default is v2. Only an explicit "classic" key opens the old UI (ADR-093). */
export function getUiVersion(): UiVersion {
  try {
    return globalThis.localStorage?.getItem(KEY) === "classic" ? "classic" : "v2";
  } catch {
    return "v2";
  }
}

/** Flush dirty shell (if registered) then reload into classic/v2. */
export async function switchUiVersion(next: UiVersion): Promise<void> {
  const ok = await ensureShellCleanForLeave();
  if (!ok) return;
  try {
    globalThis.localStorage?.setItem(KEY, next);
  } catch {
    // storage unavailable; reload anyway
  }
  window.location.reload();
}
