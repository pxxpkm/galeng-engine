import { isRect, rectHasNonInteger } from "./canvas";
import { loadExplore } from "./commands";
import type {
  ExploreAction,
  ExploreDoc,
  ExploreProject,
  ExploreScene,
  Interaction,
  InteractionOn,
  Pred,
  SceneCatalogEntry,
} from "./types";
import { onKey } from "./types";

export type ProblemSeverity = "error" | "warn";

export interface ExploreProblem {
  id: string;
  severity: ProblemSeverity;
  /** Stable machine key for i18n later. */
  key: string;
  message: string;
  hotspotId?: string;
  /** Matrix cell location when the problem is on an interaction. */
  on?: InteractionOn;
  /** True when the problem is on scene.onEnter. */
  onEnter?: boolean;
  detail?: string;
  /** Set when problem comes from a multi-scene pack scan (L4). */
  sceneId?: string;
}

/** Matrix map key for a problem that targets a hotspot×verb/item cell. */
export function problemMatrixKey(p: ExploreProblem): string | null {
  if (!p.hotspotId || !p.on) return null;
  return `${p.hotspotId}|${onKey(p.on)}`;
}

export function buildProblemMatrixKeys(problems: ExploreProblem[]): Set<string> {
  const keys = new Set<string>();
  for (const p of problems) {
    const k = problemMatrixKey(p);
    if (k) keys.add(k);
  }
  return keys;
}

/** Hotspot ids that have any problem (cell or hotspot-level). */
export function buildProblemHotspotIds(problems: ExploreProblem[]): Set<string> {
  const ids = new Set<string>();
  for (const p of problems) {
    if (p.hotspotId) ids.add(p.hotspotId);
  }
  return ids;
}

export function formatProblemContext(p: ExploreProblem): string {
  if (p.onEnter) return "入場動作";
  if (p.hotspotId && p.on) {
    const onLabel = "verb" in p.on ? `動詞 ${p.on.verb}` : `物品 ${p.on.item}`;
    return `${p.hotspotId} · ${onLabel}`;
  }
  if (p.hotspotId) return `熱區 ${p.hotspotId}`;
  return "專案";
}

export function formatProblemSeverity(s: ProblemSeverity): string {
  return s === "error" ? "錯誤" : "警告";
}

/** Badge text e.g. 「錯誤 2／警告 1」; empty when both zero. */
export function formatProblemsBadge(errorCount: number, warnCount: number): string {
  const parts: string[] = [];
  if (errorCount > 0) parts.push(`錯誤 ${errorCount}`);
  if (warnCount > 0) parts.push(`警告 ${warnCount}`);
  return parts.join("／");
}

export type ProblemNavTarget =
  | { kind: "cell"; hotspotId: string; on: InteractionOn }
  | { kind: "hotspot"; hotspotId: string }
  | { kind: "onEnter" }
  | { kind: "none" };

export function problemNavTarget(p: ExploreProblem): ProblemNavTarget {
  if (p.onEnter) return { kind: "onEnter" };
  if (p.hotspotId && p.on) return { kind: "cell", hotspotId: p.hotspotId, on: p.on };
  if (p.hotspotId) return { kind: "hotspot", hotspotId: p.hotspotId };
  return { kind: "none" };
}

export interface CollectProblemsOptions {
  /** Legacy: set of known scene ids (any kind). */
  knownSceneIds?: Set<string>;
  /** Preferred: catalog with kind + hasReturn for dead-end Call checks. */
  sceneCatalog?: SceneCatalogEntry[];
  /** Skip project-level startScene check (sibling scenes in a pack scan). */
  skipStartSceneCheck?: boolean;
}

/** One explore scene's problems (L4 pack gate). */
export interface SceneProblemGroup {
  sceneId: string;
  problems: ExploreProblem[];
}

function walkActions(inter: Interaction, visit: (a: ExploreAction, actionIndex: number) => void): void {
  let i = 0;
  for (const rule of inter.rules) {
    for (const a of rule.do) {
      visit(a, i);
      i += 1;
    }
  }
}

function catalogMap(
  opts: CollectProblemsOptions,
): Map<string, SceneCatalogEntry> {
  const m = new Map<string, SceneCatalogEntry>();
  if (opts.sceneCatalog) {
    for (const e of opts.sceneCatalog) m.set(e.id, e);
  }
  if (opts.knownSceneIds) {
    for (const id of opts.knownSceneIds) {
      if (!m.has(id)) m.set(id, { id, kind: "explore" });
    }
  }
  return m;
}

type ActionLoc = {
  /** Stable id fragment, e.g. hotspot id or "onEnter". */
  loc: string;
  hotspotId?: string;
  on?: InteractionOn;
  onEnter?: boolean;
};

/** Validate one action list (interaction do[] or scene.onEnter). */
function checkActions(
  actions: ExploreAction[],
  loc: ActionLoc,
  ctx: {
    out: ExploreProblem[];
    switchIds: Set<string>;
    itemIds: Set<string>;
    scenes: Map<string, SceneCatalogEntry>;
    hasCatalog: boolean;
    effects: Set<string>;
  },
): void {
  const { out, switchIds, itemIds, scenes, hasCatalog, effects } = ctx;
  const hs = loc.hotspotId;
  const locFields = {
    hotspotId: hs,
    ...(loc.on ? { on: loc.on } : {}),
    ...(loc.onEnter ? { onEnter: true as const } : {}),
  };

  for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
    const a = actions[actionIndex]!;
    const idx = `${loc.loc}-${actionIndex}`;

    if (a.type === "call" || a.type === "gotoScene") {
      const scene = a.scene?.trim() ?? "";
      if (!scene) {
        out.push({
          id: `empty-scene-${a.type}-${idx}`,
          severity: "error",
          key: "explore.emptySceneRef",
          message: `${a.type} 未選擇目標場景`,
          ...locFields,
        });
      } else if (hasCatalog && !scenes.has(scene)) {
        out.push({
          id: `bad-scene-${a.type}-${scene}-${idx}`,
          severity: "error",
          key: "explore.danglingSceneRef",
          message: `${a.type} 指向未知場景：${scene}`,
          ...locFields,
          detail: scene,
        });
      } else if (a.type === "call" && scenes.has(scene)) {
        const meta = scenes.get(scene)!;
        if (meta.kind === "dialogue" && meta.hasReturn === false) {
          out.push({
            id: `dead-call-${scene}-${idx}`,
            severity: "error",
            key: "explore.deadEndCall",
            message: `死路呼叫：場景「${scene}」不會返回`,
            ...locFields,
            detail: scene,
          });
        }
      }
    }

    if (a.type === "setSwitch" && !switchIds.has(a.id)) {
      out.push({
        id: `bad-switch-${a.id}-${idx}`,
        severity: "error",
        key: "explore.unknownSwitch",
        message: `未知開關：${a.id}`,
        ...locFields,
      });
    }
    if ((a.type === "giveItem" || a.type === "takeItem") && !itemIds.has(a.id)) {
      out.push({
        id: `bad-item-${a.id}-${idx}`,
        severity: "error",
        key: "explore.unknownItem",
        message: `未知物品：${a.id}`,
        ...locFields,
      });
    }

    if (a.type === "say" && (!a.text || !a.text.trim())) {
      out.push({
        id: `empty-say-${idx}`,
        severity: "error",
        key: "explore.emptySay",
        message: `空對白（say.text）`,
        ...locFields,
      });
    }

    if (
      (a.type === "call" || a.type === "return" || a.type === "gotoScene") &&
      a.trans &&
      !effects.has(a.trans)
    ) {
      out.push({
        id: `bad-trans-${a.trans}-${idx}`,
        severity: "warn",
        key: "explore.unknownTrans",
        message: `未知轉場：${a.trans}`,
        ...locFields,
        detail: a.trans,
      });
    }
  }
}


/** Validate Pred[] for switch / hasItem (empty or unknown → error). Skips var. */
function checkPreds(
  preds: Pred[] | null | undefined,
  loc: ActionLoc & { kind: "when" | "visibleIf" | "enabledIf"; ruleIndex?: number },
  ctx: {
    out: ExploreProblem[];
    switchIds: Set<string>;
    itemIds: Set<string>;
  },
): void {
  if (!preds || preds.length === 0) return;
  const { out, switchIds, itemIds } = ctx;
  const hs = loc.hotspotId;
  const locFields = {
    hotspotId: hs,
    ...(loc.on ? { on: loc.on } : {}),
    ...(loc.onEnter ? { onEnter: true as const } : {}),
  };
  const ruleBit = loc.ruleIndex !== undefined ? `r${loc.ruleIndex}` : "x";

  for (let i = 0; i < preds.length; i++) {
    const p = preds[i]!;
    const idx = `${loc.loc}-${loc.kind}-${ruleBit}-${i}`;

    if ("switch" in p) {
      const id = (p.switch ?? "").trim();
      if (!id) {
        out.push({
          id: `empty-pred-switch-${idx}`,
          severity: "error",
          key: "explore.emptyPredSwitch",
          message: `${loc.kind} 條件空開關 id`,
          ...locFields,
        });
      } else if (!switchIds.has(id)) {
        out.push({
          id: `bad-pred-switch-${id}-${idx}`,
          severity: "error",
          key: "explore.unknownPredSwitch",
          message: `${loc.kind} 未知開關：${id}`,
          ...locFields,
          detail: id,
        });
      }
      continue;
    }

    if ("hasItem" in p) {
      const id = (p.hasItem ?? "").trim();
      if (!id) {
        out.push({
          id: `empty-pred-item-${idx}`,
          severity: "error",
          key: "explore.emptyPredHasItem",
          message: `${loc.kind} 條件空物品 id`,
          ...locFields,
        });
      } else if (!itemIds.has(id)) {
        out.push({
          id: `bad-pred-item-${id}-${idx}`,
          severity: "error",
          key: "explore.unknownPredHasItem",
          message: `${loc.kind} 未知物品：${id}`,
          ...locFields,
          detail: id,
        });
      }
    }
  }
}

/** Problems rules for Explore editor (M2 + M3 dead-end Call + onEnter). */
export function collectExploreProblems(
  doc: ExploreDoc,
  knownSceneIdsOrOpts: Set<string> | CollectProblemsOptions = {},
): ExploreProblem[] {
  const opts: CollectProblemsOptions =
    knownSceneIdsOrOpts instanceof Set
      ? { knownSceneIds: knownSceneIdsOrOpts }
      : knownSceneIdsOrOpts;

  const out: ExploreProblem[] = [];
  const switchIds = new Set(doc.project.switches.map((s) => s.id));
  const itemIds = new Set(doc.project.items.map((i) => i.id));
  const hotspotIds = new Set(doc.scene.hotspots.map((h) => h.id));
  const scenes = catalogMap(opts);
  const hasCatalog = scenes.size > 0;
  const effects = new Set((doc.project.effectLibrary ?? []).map((e) => e.id));
  const ctx = { out, switchIds, itemIds, scenes, hasCatalog, effects };

  // Rule 1: duplicate hotspot ids
  const seen = new Set<string>();
  for (const h of doc.scene.hotspots) {
    if (seen.has(h.id)) {
      out.push({
        id: `dup-hotspot-${h.id}`,
        severity: "error",
        key: "explore.dupHotspotId",
        message: `重複熱區 id：${h.id}`,
        hotspotId: h.id,
      });
    }
    seen.add(h.id);
  }

  // Rule 2: interaction references missing hotspot
  for (const inter of doc.scene.interactions) {
    if (!hotspotIds.has(inter.hotspot)) {
      const onKey = "verb" in inter.on ? inter.on.verb : inter.on.item;
      out.push({
        id: `orphan-inter-${inter.hotspot}-${onKey}`,
        severity: "error",
        key: "explore.orphanInteraction",
        message: `互動指向不存在的熱區：${inter.hotspot}`,
        hotspotId: inter.hotspot,
        on: inter.on,
      });
    }
  }

  // Rule 3–6: action checks on interactions (call/goto/switch/item/say/trans)
  for (const inter of doc.scene.interactions) {
    const flat: ExploreAction[] = [];
    walkActions(inter, (a) => {
      flat.push(a);
    });
    checkActions(flat, { loc: inter.hotspot, hotspotId: inter.hotspot, on: inter.on }, ctx);
  }

  // Rule 3–6b: same checks on scene.onEnter (OnEnterInspector)
  checkActions(doc.scene.onEnter ?? [], { loc: "onEnter", onEnter: true }, ctx);

  // Rule 5: warn empty explore room (no hotspots)
  if (doc.scene.hotspots.length === 0) {
    out.push({
      id: "no-hotspots",
      severity: "warn",
      key: "explore.noHotspots",
      message: "探險場景尚無熱區",
    });
  }

  // Rule 5c: non-integer hotspot rect coords (schema i32 / 1920×1080)
  for (const h of doc.scene.hotspots) {
    if (isRect(h.shape) && rectHasNonInteger(h.shape)) {
      out.push({
        id: `float-hotspot-${h.id}`,
        severity: "error",
        key: "explore.nonIntegerHotspot",
        message: `熱區「${h.id}」座標必須為整數`,
        hotspotId: h.id,
      });
    }
  }

  // Rule 5d: non-positive rect size (canvas / Inspector clamp to w|h >= 1)
  for (const h of doc.scene.hotspots) {
    if (isRect(h.shape) && (h.shape.w <= 0 || h.shape.h <= 0)) {
      out.push({
        id: `nonpos-hotspot-${h.id}`,
        severity: "error",
        key: "explore.nonPositiveHotspot",
        message: `熱區「${h.id}」寬高必須 > 0`,
        hotspotId: h.id,
      });
    }
  }

  // Rule 6: when / visibleIf / enabledIf — switch & hasItem only (L2)
  for (const inter of doc.scene.interactions) {
    inter.rules.forEach((rule, ruleIndex) => {
      checkPreds(
        rule.when,
        { loc: inter.hotspot, hotspotId: inter.hotspot, on: inter.on, kind: "when", ruleIndex },
        ctx,
      );
    });
  }
  for (const h of doc.scene.hotspots) {
    checkPreds(h.visibleIf, { loc: h.id, hotspotId: h.id, kind: "visibleIf" }, ctx);
    checkPreds(h.enabledIf, { loc: h.id, hotspotId: h.id, kind: "enabledIf" }, ctx);
  }

  // Rule 7: startScene non-empty; unknown id when catalog present (L3)
  if (!opts.skipStartSceneCheck) {
    const start = (doc.project.startScene ?? "").trim();
    if (!start) {
      out.push({
        id: "bad-start-scene-empty",
        severity: "error",
        key: "explore.badStartScene",
        message: "起始場景未設定",
      });
    } else if (hasCatalog && !scenes.has(start)) {
      out.push({
        id: `bad-start-scene-${start}`,
        severity: "error",
        key: "explore.badStartScene",
        message: `起始場景未知：${start}`,
        detail: start,
      });
    }
  }

  // Rule 7b: transitionDefaults ids must exist in effectLibrary (when set)
  const defaults = doc.project.transitionDefaults;
  if (defaults) {
    for (const key of ["toDialogue", "fromDialogue", "gotoScene"] as const) {
      const id = defaults[key];
      if (id && !effects.has(id)) {
        out.push({
          id: `bad-trans-default-${key}-${id}`,
          severity: "warn",
          key: "explore.unknownTransDefault",
          message: `轉場預設「${key}」未知特效：${id}`,
          detail: id,
        });
      }
    }
  }

  // Rule 8: rules after an unconditional earlier rule are unreachable (L5)
  for (const inter of doc.scene.interactions) {
    const onKey = "verb" in inter.on ? inter.on.verb : inter.on.item;
    let blocked = false;
    for (let ri = 0; ri < inter.rules.length; ri++) {
      if (blocked) {
        out.push({
          id: `shadowed-rule-${inter.hotspot}-${onKey}-r${ri}`,
          severity: "warn",
          key: "explore.shadowedRule",
          message: `規則 ${ri + 1} 被前面無條件規則遮蔽（不會執行）`,
          hotspotId: inter.hotspot,
          on: inter.on,
          detail: `${inter.hotspot}/${onKey}#${ri}`,
        });
      }
      if (inter.rules[ri]!.when.length === 0) {
        blocked = true;
      }
    }
  }

  return out;
}

/**
 * Pure L4 helper: run Problems on each explore scene sharing one project.
 * startScene is checked only on the first scene in the list.
 */
export function collectExploreProblemsForScenes(
  project: ExploreProject,
  scenes: ExploreScene[],
  opts: CollectProblemsOptions = {},
): SceneProblemGroup[] {
  return scenes.map((scene, index) => {
    const doc = loadExplore(project, scene);
    const problems = collectExploreProblems(doc, {
      ...opts,
      skipStartSceneCheck: index > 0 || opts.skipStartSceneCheck === true,
    }).map((p) => ({
      ...p,
      sceneId: scene.id,
      id: `${scene.id}:${p.id}`,
    }));
    return { sceneId: scene.id, problems };
  });
}

export function countErrorProblemsInGroups(groups: SceneProblemGroup[]): number {
  let n = 0;
  for (const g of groups) {
    for (const p of g.problems) {
      if (p.severity === "error") n += 1;
    }
  }
  return n;
}

/** Compact status line: `room（2）；attic（1）`. */
export function formatPackProblemReport(groups: SceneProblemGroup[]): string {
  const parts: string[] = [];
  for (const g of groups) {
    const errs = g.problems.filter((p) => p.severity === "error");
    if (errs.length === 0) continue;
    parts.push(`${g.sceneId}（${errs.length}）`);
  }
  return parts.join("；");
}

export function flattenSceneProblemGroups(
  groups: SceneProblemGroup[],
): ExploreProblem[] {
  return groups.flatMap((g) => g.problems);
}
