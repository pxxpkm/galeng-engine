import type { ExploreDoc, ExploreAction, Interaction } from "./types";

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

function walkActions(inter: Interaction, visit: (a: ExploreAction) => void): void {
  for (const rule of inter.rules) {
    for (const a of rule.do) visit(a);
  }
}

/** Initial Problems rules for M2 (1–2+). */
export function collectExploreProblems(
  doc: ExploreDoc,
  knownSceneIds: Set<string> = new Set(),
): ExploreProblem[] {
  const out: ExploreProblem[] = [];
  const switchIds = new Set(doc.project.switches.map((s) => s.id));
  const itemIds = new Set(doc.project.items.map((i) => i.id));
  const hotspotIds = new Set(doc.scene.hotspots.map((h) => h.id));

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

  // Rule 3: call/goto to unknown scene (warn if knownSceneIds provided non-empty)
  if (knownSceneIds.size > 0) {
    for (const inter of doc.scene.interactions) {
      walkActions(inter, (a) => {
        if (a.type === "call" || a.type === "gotoScene") {
          if (!knownSceneIds.has(a.scene)) {
            out.push({
              id: `bad-scene-${a.type}-${a.scene}-${inter.hotspot}`,
              severity: "error",
              key: "explore.danglingSceneRef",
              message: `${a.type} 指向未知場景：${a.scene}`,
              hotspotId: inter.hotspot,
              detail: a.scene,
            });
          }
        }
      });
    }
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

  return out;
}
