import { isMissingAsset, knownLogicals } from "./assets";
import { collectCites } from "./overview";
import { projectSaveIssues, sceneSaveIssues, type SaveIssue } from "./saveIssues";
import type { AssetMeta, Exit, Project, Scene, SceneMeta } from "./types";

/** Where an issue lives; the editor jumps here when the row is clicked. */
export type IssueTarget =
  | { kind: "beat"; sceneId: string; beatIndex: number }
  | { kind: "exit"; sceneId: string; choiceIndex?: number }
  | { kind: "project" };

export interface LiveIssue {
  key: string;
  params?: Record<string, string | number>;
  target: IssueTarget;
}

export interface LiveIssueContext {
  liveIds: Set<string>;
  archivedIds: Set<string>;
  knownAssets: Set<string>;
}

export function liveIssueContext(
  liveScenes: SceneMeta[],
  archivedScenes: SceneMeta[],
  assets: AssetMeta[],
): LiveIssueContext {
  return {
    liveIds: new Set(liveScenes.map((s) => s.id)),
    archivedIds: new Set(archivedScenes.map((s) => s.id)),
    knownAssets: knownLogicals(assets),
  };
}

const BEAT_ISSUE_KEYS = new Set([
  "editor.emptySaySpeaker",
  "editor.emptySayText",
  "editor.emptyCharId",
  "editor.emptyCharFace",
]);

function sceneIssueTarget(sceneId: string, issue: SaveIssue): IssueTarget {
  const n = typeof issue.params?.n === "number" ? issue.params.n : 0;
  if (BEAT_ISSUE_KEYS.has(issue.key)) {
    return { kind: "beat", sceneId, beatIndex: n };
  }
  if (issue.key === "editor.emptyChoiceText" || issue.key === "editor.emptyChoiceGoto") {
    return { kind: "exit", sceneId, choiceIndex: n };
  }
  return { kind: "exit", sceneId };
}

type GotoSite = { goto: string; choiceIndex?: number };

function exitGotoSites(exit: Exit | undefined): GotoSite[] {
  if (!exit) {
    return [];
  }
  if (exit.type === "next") {
    return [{ goto: exit.goto }];
  }
  if (exit.type === "choices") {
    return exit.options.map((opt, choiceIndex) => ({ goto: opt.goto, choiceIndex }));
  }
  if (exit.type === "return" || exit.type === "end") {
    return [];
  }
  if (exit.type === "call") {
    return [{ goto: exit.scene }];
  }
  if (exit.type === "branch") {
    return [{ goto: exit.then }, { goto: exit.else }];
  }
  return [];
}

function gotoIssues(scene: Scene, ctx: LiveIssueContext): LiveIssue[] {
  const out: LiveIssue[] = [];
  for (const site of exitGotoSites(scene.exit)) {
    const goto = site.goto.trim();
    if (!goto || ctx.liveIds.has(goto)) {
      continue;
    }
    out.push({
      key: ctx.archivedIds.has(goto) ? "editor.issueArchivedGoto" : "editor.issueDanglingGoto",
      params: { goto },
      target: { kind: "exit", sceneId: scene.id, choiceIndex: site.choiceIndex },
    });
  }
  return out;
}

function missingAssetIssues(
  project: Project | null,
  scenes: Scene[],
  knownAssets: Set<string>,
): LiveIssue[] {
  const out: LiveIssue[] = [];
  for (const site of collectCites(project, scenes)) {
    if (!isMissingAsset(site.logical, knownAssets)) {
      continue;
    }
    const target: IssueTarget = site.sceneId
      ? { kind: "beat", sceneId: site.sceneId, beatIndex: site.beatIndex ?? 0 }
      : { kind: "project" };
    out.push({
      key: "editor.issueMissingAsset",
      params: { logical: site.logical },
      target,
    });
  }
  return out;
}

/** Issues inside one scene (unsaved edits included); project-level items excluded. */
export function sceneLiveIssues(scene: Scene, ctx: LiveIssueContext): LiveIssue[] {
  return [
    ...sceneSaveIssues(scene).map((issue) => ({
      ...issue,
      target: sceneIssueTarget(scene.id, issue),
    })),
    ...gotoIssues(scene, ctx),
    ...missingAssetIssues(null, [scene], ctx.knownAssets),
  ];
}

/** Every issue across loaded scenes plus project level (roster, galleries, title fields). */
export function liveIssues(
  project: Project | null,
  scenes: Scene[],
  ctx: LiveIssueContext,
): LiveIssue[] {
  const out: LiveIssue[] = [];
  for (const scene of scenes) {
    out.push(...sceneLiveIssues(scene, ctx));
  }
  if (project) {
    for (const issue of projectSaveIssues(project)) {
      out.push({ ...issue, target: { kind: "project" } });
    }
  }
  out.push(...missingAssetIssues(project, [], ctx.knownAssets));
  return out;
}
