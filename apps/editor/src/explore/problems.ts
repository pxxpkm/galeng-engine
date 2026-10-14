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

function walkActions(inter: Interaction, visit: (a: ExploreAction) => void): void {
  for (const rule of inter.rules) {
    for (const a of rule.do) visit(a);
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

/** Problems rules for Explore editor (M2 + M3 dead-end Call). */
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
      out.push({
        id: `orphan-inter-${inter.hotspot}-${"verb" in inter.on ? inter.on.verb : inter.on.item}`,
        severity: "error",
        key: "explore.orphanInteraction",
        message: `互動指向不存在嘅熱區：${inter.hotspot}`,
        hotspotId: inter.hotspot,
      });
    }
  }

  // Rule 3–3c: call / goto scene refs + dead-end + empty
  for (const inter of doc.scene.interactions) {
    walkActions(inter, (a) => {
      if (a.type === "call" || a.type === "gotoScene") {
        const scene = a.scene?.trim() ?? "";
        if (!scene) {
          out.push({
            id: `empty-scene-${a.type}-${inter.hotspot}`,
            severity: "error",
            key: "explore.emptySceneRef",
            message: `${a.type} 未揀目標場景`,
            hotspotId: inter.hotspot,
          });
          return;
        }
        if (hasCatalog && !scenes.has(scene)) {
          out.push({
            id: `bad-scene-${a.type}-${scene}-${inter.hotspot}`,
            severity: "error",
            key: "explore.danglingSceneRef",
            message: `${a.type} 指向未知場景：${scene}`,
            hotspotId: inter.hotspot,
            detail: scene,
          });
        }
        // M3: dead-end Call — dialogue target without return exit
        if (a.type === "call" && scenes.has(scene)) {
          const meta = scenes.get(scene)!;
          if (meta.kind === "dialogue" && meta.hasReturn === false) {
            out.push({
              id: `dead-call-${scene}-${inter.hotspot}`,
              severity: "error",
              key: "explore.deadEndCall",
              message: `死路 Call：場景「${scene}」唔會 Return`,
              hotspotId: inter.hotspot,
              detail: scene,
            });
          }
        }
      }
    });
  }

  // Rule 4: setSwitch / giveItem / takeItem unknown ids
  for (const inter of doc.scene.interactions) {
    walkActions(inter, (a) => {
      if (a.type === "setSwitch" && !switchIds.has(a.id)) {
        out.push({
          id: `bad-switch-${a.id}-${inter.hotspot}`,
          severity: "error",
          key: "explore.unknownSwitch",
          message: `未知開關：${a.id}`,
          hotspotId: inter.hotspot,
        });
      }
      if ((a.type === "giveItem" || a.type === "takeItem") && !itemIds.has(a.id)) {
        out.push({
          id: `bad-item-${a.id}-${inter.hotspot}`,
          severity: "error",
          key: "explore.unknownItem",
          message: `未知物品：${a.id}`,
          hotspotId: inter.hotspot,
        });
      }
    });
  }

  // Rule 5: warn empty explore room (no hotspots)
  if (doc.scene.hotspots.length === 0) {
    out.push({
      id: "no-hotspots",
      severity: "warn",
      key: "explore.noHotspots",
      message: "探險場景未有熱區",
    });
  }

  // Rule 5b: empty say text (schema nonEmptyString)
  for (const inter of doc.scene.interactions) {
    walkActions(inter, (a) => {
      if (a.type === "say" && (!a.text || !a.text.trim())) {
        out.push({
          id: `empty-say-${inter.hotspot}`,
          severity: "error",
          key: "explore.emptySay",
          message: `空對白（say.text）`,
          hotspotId: inter.hotspot,
        });
      }
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

  // Rule 6: warn unknown transition id on actions (if effectLibrary present)
  const effects = new Set((doc.project.effectLibrary ?? []).map((e) => e.id));
  if (effects.size > 0) {
    for (const inter of doc.scene.interactions) {
      walkActions(inter, (a) => {
        if (
          (a.type === "call" || a.type === "return" || a.type === "gotoScene") &&
          a.trans &&
          !effects.has(a.trans)
        ) {
          out.push({
            id: `bad-trans-${a.trans}-${inter.hotspot}`,
            severity: "warn",
            key: "explore.unknownTrans",
            message: `未知轉場：${a.trans}`,
            hotspotId: inter.hotspot,
            detail: a.trans,
          });
        }
      });
    }
  }

  return out;
}
