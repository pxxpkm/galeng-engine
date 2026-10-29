import type { IssueTarget } from "./liveIssues";
import { formatSaveIssues, type SaveIssue } from "./saveIssues";

/** What one document shows. `saved` is only a finished response that cleared dirty. */
export type SavePhase = "clean" | "dirty" | "saving" | "saved" | "failed";

export type SaveOutcome = "none" | "saved" | "failed";

export interface LayerFailure {
  reason: string;
  conflict: boolean;
  focus: IssueTarget | null;
}

/**
 * Author-facing phase for one file.
 * A response must not paint "saved" while the draft is still dirty, or while
 * the writer is still in flight after a newer edit.
 */
export function presentLayer(input: {
  dirty: boolean;
  inflight: boolean;
  editedSinceStart: boolean;
  outcome: SaveOutcome;
}): SavePhase {
  if (input.inflight) {
    return input.editedSinceStart ? "dirty" : "saving";
  }
  if (input.dirty && input.outcome === "failed") return "failed";
  if (input.dirty) return "dirty";
  if (input.outcome === "saved") return "saved";
  return "clean";
}

/** Leave and close stay blocked while either document is dirty. Labels do not clear that. */
export function anyDirtyBlocksLeave(sceneDirty: boolean, projectDirty: boolean): boolean {
  return sceneDirty || projectDirty;
}

/** Retry reads the draft now, not the body that already failed. */
export function saveBodyFromLatest<T>(latest: T): T {
  return latest;
}

export function nextLayerDirty(
  prev: { project: boolean; scene: boolean },
  before: { project: unknown; scene: unknown },
  after: { project: unknown; scene: unknown },
): { project: boolean; scene: boolean; any: boolean } {
  const project = prev.project || JSON.stringify(before.project) !== JSON.stringify(after.project);
  const scene = prev.scene || JSON.stringify(before.scene) !== JSON.stringify(after.scene);
  return { project, scene, any: project || scene };
}

export function describeBlockedSave(
  issues: SaveIssue[],
  t: (key: string) => string,
  focusOf: (issue: SaveIssue) => IssueTarget | null,
): { message: string; focus: IssueTarget | null } {
  return {
    message: formatSaveIssues(issues, t),
    focus: issues.length > 0 ? focusOf(issues[0]!) : null,
  };
}

/** Explore chrome is Chinese. Idle is blank — never "已同步" before a save returns. */
export function exploreLayerLabel(phase: SavePhase, name: "專案" | "場景"): string {
  if (phase === "clean") return "";
  if (phase === "dirty") return `${name}未儲存`;
  if (phase === "saving") return `${name}儲存中`;
  if (phase === "saved") return `${name}已儲存`;
  return `${name}儲存失敗`;
}

export function exploreBlockedStatus(problem: {
  message: string;
  context: string;
  navKind: string;
} | null): { status: string; canFocus: boolean } {
  if (!problem) return { status: "無法儲存", canFocus: false };
  return {
    status: `無法儲存：${problem.context} ${problem.message}`,
    canFocus: problem.navKind !== "none",
  };
}
