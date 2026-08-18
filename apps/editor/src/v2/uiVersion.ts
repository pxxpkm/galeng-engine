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

export function switchUiVersion(next: UiVersion): void {
  try {
    globalThis.localStorage?.setItem(KEY, next);
  } catch {
    // storage unavailable; reload anyway
  }
  window.location.reload();
}
