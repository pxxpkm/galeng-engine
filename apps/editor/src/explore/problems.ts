import { isRect, rectHasNonInteger } from "./canvas";
import type {
  ExploreAction,
  ExploreDoc,
  Interaction,
  SceneCatalogEntry,
} from "./types";

export type ProblemSeverity = "error" | "warn";

export interface ExploreProblem {
  id: string;
  severity: ProblemSeverity;
  /** Stable machine key for i18n later. */
  key: string;
  message: string;
  hotspotId?: string;
  detail?: string;
}

export interface CollectProblemsOptions {
  /** Legacy: set of known scene ids (any kind). */
  knownSceneIds?: Set<string>;
  /** Preferred: catalog with kind + hasReturn for dead-end Call checks. */
  sceneCatalog?: SceneCatalogEntry[];
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
          message: `${a.type} 未揀目標場景`,
          hotspotId: hs,
        });
      } else if (hasCatalog && !scenes.has(scene)) {
        out.push({
          id: `bad-scene-${a.type}-${scene}-${idx}`,
          severity: "error",
          key: "explore.danglingSceneRef",
          message: `${a.type} 指向未知場景：${scene}`,
          hotspotId: hs,
          detail: scene,
        });
      } else if (a.type === "call" && scenes.has(scene)) {
        const meta = scenes.get(scene)!;
        if (meta.kind === "dialogue" && meta.hasReturn === false) {
          out.push({
            id: `dead-call-${scene}-${idx}`,
            severity: "error",
            key: "explore.deadEndCall",
            message: `死路 Call：場景「${scene}」唔會 Return`,
            hotspotId: hs,
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
        hotspotId: hs,
      });
    }
    if ((a.type === "giveItem" || a.type === "takeItem") && !itemIds.has(a.id)) {
      out.push({
        id: `bad-item-${a.id}-${idx}`,
        severity: "error",
        key: "explore.unknownItem",
        message: `未知物品：${a.id}`,
        hotspotId: hs,
      });
    }

    if (a.type === "say" && (!a.text || !a.text.trim())) {
      out.push({
        id: `empty-say-${idx}`,
        severity: "error",
        key: "explore.emptySay",
        message: `空對白（say.text）`,
        hotspotId: hs,
      });
    }

    if (
      effects.size > 0 &&
      (a.type === "call" || a.type === "return" || a.type === "gotoScene") &&
      a.trans &&
      !effects.has(a.trans)
    ) {
      out.push({
        id: `bad-trans-${a.trans}-${idx}`,
        severity: "warn",
        key: "explore.unknownTrans",
        message: `未知轉場：${a.trans}`,
        hotspotId: hs,
        detail: a.trans,
      });
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
        message: `互動指向不存在嘅熱區：${inter.hotspot}`,
        hotspotId: inter.hotspot,
      });
    }
  }

  // Rule 3–6: action checks on interactions (call/goto/switch/item/say/trans)
  for (const inter of doc.scene.interactions) {
    const flat: ExploreAction[] = [];
    walkActions(inter, (a) => {
      flat.push(a);
    });
    checkActions(flat, { loc: inter.hotspot, hotspotId: inter.hotspot }, ctx);
  }

  // Rule 3–6b: same checks on scene.onEnter (OnEnterInspector)
  checkActions(doc.scene.onEnter ?? [], { loc: "onEnter" }, ctx);

  // Rule 5: warn empty explore room (no hotspots)
  if (doc.scene.hotspots.length === 0) {
    out.push({
      id: "no-hotspots",
      severity: "warn",
      key: "explore.noHotspots",
      message: "探險場景未有熱區",
    });
  }

  // Rule 5c: non-integer hotspot rect coords (schema i32 / 1920×1080)
  for (const h of doc.scene.hotspots) {
    if (isRect(h.shape) && rectHasNonInteger(h.shape)) {
      out.push({
        id: `float-hotspot-${h.id}`,
        severity: "error",
        key: "explore.nonIntegerHotspot",
        message: `熱區「${h.id}」座標必須係整數`,
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

  return out;
}
