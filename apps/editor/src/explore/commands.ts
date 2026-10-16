import { defaultHotspotPlacement, roundPolygonPoints, roundRect } from "./canvas";
import { convertHotspotShape } from "./ctxMenuModel";
import type { Command } from "./commandBus";
import {
  sameOn,
  type CharacterDef,
  type ExploreAction,
  type ExploreDoc,
  type Hotspot,
  type Interaction,
  type InteractionOn,
  type InteractionRule,
  type ItemDef,
  type SwitchDef,
} from "./types";

export function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

export function addHotspot(partial?: Partial<Hotspot>): Command {
  return {
    id: "explore.addHotspot",
    label: "Add hotspot",
    apply(doc) {
      const taken = new Set(doc.scene.hotspots.map((h) => h.id));
      const id = uniqueId(partial?.id ?? "hotspot", taken);
      const hs: Hotspot = {
        id,
        name: partial?.name ?? id,
        shape: partial?.shape ?? {
          type: "rect",
          ...defaultHotspotPlacement(doc.scene.hotspots, doc.project.resolution),
        },
        visibleIf: partial?.visibleIf ?? null,
        enabledIf: partial?.enabledIf ?? null,
        defaultVerb: partial?.defaultVerb,
      };
      return {
        ...doc,
        scene: { ...doc.scene, hotspots: [...doc.scene.hotspots, hs] },
        ui: { ...doc.ui, selectedHotspotId: id, selectedCell: null },
      };
    },
  };
}

export function removeHotspot(hotspotId: string): Command {
  return {
    id: "explore.removeHotspot",
    label: `Remove hotspot ${hotspotId}`,
    apply(doc) {
      return {
        ...doc,
        scene: {
          ...doc.scene,
          hotspots: doc.scene.hotspots.filter((h) => h.id !== hotspotId),
          interactions: doc.scene.interactions.filter((i) => i.hotspot !== hotspotId),
        },
        ui: {
          ...doc.ui,
          selectedHotspotId:
            doc.ui.selectedHotspotId === hotspotId ? null : doc.ui.selectedHotspotId,
          selectedCell:
            doc.ui.selectedCell?.hotspotId === hotspotId ? null : doc.ui.selectedCell,
        },
      };
    },
  };
}

export function updateHotspot(
  hotspotId: string,
  patch: Partial<Hotspot>,
  coalesceKey?: string,
): Command {
  return {
    id: "explore.updateHotspot",
    label: `Update hotspot ${hotspotId}`,
    coalesceKey,
    apply(doc) {
      return {
        ...doc,
        scene: {
          ...doc.scene,
          hotspots: doc.scene.hotspots.map((h) =>
            h.id === hotspotId ? { ...h, ...patch, id: h.id } : h,
          ),
        },
      };
    },
  };
}

export function setHotspotRect(
  hotspotId: string,
  rect: { x: number; y: number; w: number; h: number },
  coalesceKey?: string,
): Command {
  const r = roundRect(rect);
  const shape = { type: "rect" as const, ...r };
  return updateHotspot(hotspotId, { shape }, coalesceKey);
}

/** Set polygon hotspot vertices (integer coords; no-op if fewer than 3 points). */
export function setHotspotPolygonPoints(
  hotspotId: string,
  points: [number, number][],
  coalesceKey?: string,
): Command {
  const pts = roundPolygonPoints(points);
  if (pts.length < 3) {
    return {
      id: "explore.setHotspotPolygonPoints",
      label: `Set polygon points ${hotspotId}`,
      coalesceKey,
      apply: (doc) => doc,
    };
  }
  return updateHotspot(
    hotspotId,
    { shape: { type: "polygon", points: pts } },
    coalesceKey,
  );
}

/** Rect corners → polygon shape (no-op if not rect). */
export function convertHotspotToPolygon(hotspotId: string): Command {
  return {
    id: "explore.convertHotspotToPolygon",
    label: `轉為多邊形 ${hotspotId}`,
    apply(doc) {
      const hs = doc.scene.hotspots.find((h) => h.id === hotspotId);
      if (!hs) return doc;
      const next = convertHotspotShape(hs.shape, "polygon");
      if (!next) return doc;
      return updateHotspot(hotspotId, { shape: next }).apply(doc);
    },
  };
}

/** Polygon → bounding rect (no-op if not polygon). */
export function convertHotspotToRect(hotspotId: string): Command {
  return {
    id: "explore.convertHotspotToRect",
    label: `轉為矩形 ${hotspotId}`,
    apply(doc) {
      const hs = doc.scene.hotspots.find((h) => h.id === hotspotId);
      if (!hs) return doc;
      const next = convertHotspotShape(hs.shape, "rect");
      if (!next) return doc;
      return updateHotspot(hotspotId, { shape: next }).apply(doc);
    },
  };
}

export function setInteraction(
  hotspotId: string,
  on: InteractionOn,
  rules: InteractionRule[],
  coalesceKey?: string,
): Command {
  return {
    id: "explore.setInteraction",
    label: `Set interaction ${hotspotId}/${"verb" in on ? on.verb : on.item}`,
    coalesceKey,
    apply(doc) {
      const rest = doc.scene.interactions.filter(
        (i) => !(i.hotspot === hotspotId && sameOn(i.on, on)),
      );
      const next: Interaction[] =
        rules.length === 0
          ? rest
          : [...rest, { hotspot: hotspotId, on, rules }];
      return {
        ...doc,
        scene: { ...doc.scene, interactions: next },
        ui: { ...doc.ui, selectedCell: { hotspotId, on } },
      };
    },
  };
}

export function clearInteraction(hotspotId: string, on: InteractionOn): Command {
  return setInteraction(hotspotId, on, []);
}

export function pasteInteraction(hotspotId: string, on: InteractionOn): Command {
  return {
    id: "explore.pasteInteraction",
    label: "Paste interaction",
    apply(doc) {
      if (!doc.ui.clipboardRules) return doc;
      return setInteraction(hotspotId, on, structuredClone(doc.ui.clipboardRules)).apply(doc);
    },
  };
}

export function addSwitch(def: SwitchDef): Command {
  return {
    id: "db.addSwitch",
    label: `Add switch ${def.id}`,
    apply(doc) {
      if (doc.project.switches.some((s) => s.id === def.id)) return doc;
      return {
        ...doc,
        project: { ...doc.project, switches: [...doc.project.switches, def] },
      };
    },
  };
}

export function updateSwitch(id: string, patch: Partial<SwitchDef>, coalesceKey?: string): Command {
  return {
    id: "db.updateSwitch",
    label: `Update switch ${id}`,
    coalesceKey,
    apply(doc) {
      return {
        ...doc,
        project: {
          ...doc.project,
          switches: doc.project.switches.map((s) =>
            s.id === id ? { ...s, ...patch, id: s.id } : s,
          ),
        },
      };
    },
  };
}

export function removeSwitch(id: string): Command {
  return {
    id: "db.removeSwitch",
    label: `Remove switch ${id}`,
    apply(doc) {
      return {
        ...doc,
        project: {
          ...doc.project,
          switches: doc.project.switches.filter((s) => s.id !== id),
        },
      };
    },
  };
}

export function addItem(def: ItemDef): Command {
  return {
    id: "db.addItem",
    label: `Add item ${def.id}`,
    apply(doc) {
      if (doc.project.items.some((i) => i.id === def.id)) return doc;
      return {
        ...doc,
        project: { ...doc.project, items: [...doc.project.items, def] },
      };
    },
  };
}

export function updateItem(id: string, patch: Partial<ItemDef>, coalesceKey?: string): Command {
  return {
    id: "db.updateItem",
    label: `Update item ${id}`,
    coalesceKey,
    apply(doc) {
      return {
        ...doc,
        project: {
          ...doc.project,
          items: doc.project.items.map((i) =>
            i.id === id ? { ...i, ...patch, id: i.id } : i,
          ),
        },
      };
    },
  };
}

export function removeItem(id: string): Command {
  return {
    id: "db.removeItem",
    label: `Remove item ${id}`,
    apply(doc) {
      return {
        ...doc,
        project: {
          ...doc.project,
          items: doc.project.items.filter((i) => i.id !== id),
        },
      };
    },
  };
}

export function addCharacter(def: CharacterDef): Command {
  return {
    id: "db.addCharacter",
    label: `Add character ${def.id}`,
    apply(doc) {
      if (doc.project.characters.some((c) => c.id === def.id)) return doc;
      return {
        ...doc,
        project: {
          ...doc.project,
          characters: [...doc.project.characters, def],
        },
      };
    },
  };
}

export function updateCharacter(id: string, patch: Partial<CharacterDef>, coalesceKey?: string): Command {
  return {
    id: "db.updateCharacter",
    label: `Update character ${id}`,
    coalesceKey,
    apply(doc) {
      return {
        ...doc,
        project: {
          ...doc.project,
          characters: doc.project.characters.map((c) =>
            c.id === id ? { ...c, ...patch, id: c.id } : c,
          ),
        },
      };
    },
  };
}

export function removeCharacter(id: string): Command {
  return {
    id: "db.removeCharacter",
    label: `Remove character ${id}`,
    apply(doc) {
      return {
        ...doc,
        project: {
          ...doc.project,
          characters: doc.project.characters.filter((c) => c.id !== id),
        },
      };
    },
  };
}

export function setOnEnter(
  actions: ExploreAction[],
  coalesceKey?: string,
): Command {
  return {
    id: "explore.setOnEnter",
    label: "Set onEnter",
    coalesceKey,
    apply(doc) {
      return {
        ...doc,
        scene: { ...doc.scene, onEnter: structuredClone(actions) },
      };
    },
  };
}

/** Serialize scene+project slice for save/reload round-trip tests. */
export function serializeExplore(doc: ExploreDoc): {
  project: ExploreDoc["project"];
  scene: ExploreDoc["scene"];
} {
  return {
    project: structuredClone(doc.project),
    scene: structuredClone(doc.scene),
  };
}

export function loadExplore(
  project: ExploreDoc["project"],
  scene: ExploreDoc["scene"],
): ExploreDoc {
  return {
    project: structuredClone(project),
    scene: structuredClone(scene),
    ui: {
      selectedHotspotId: null,
      selectedCell: null,
      canvasTool: "select",
      clipboardRules: null,
    },
  };
}


/** Read rules for a matrix cell (empty array if unset). */
export function getInteractionRules(
  doc: ExploreDoc,
  hotspotId: string,
  on: InteractionOn,
): InteractionRule[] {
  const found = doc.scene.interactions.find(
    (i) => i.hotspot === hotspotId && sameOn(i.on, on),
  );
  return found ? structuredClone(found.rules) : [];
}

/** Patch scene meta (title / bg). Does not replace hotspots or interactions.
 * Pass `bg: undefined` (key present) to clear background. */
export function updateScene(
  patch: { title?: string; bg?: ExploreDoc["scene"]["bg"] },
  coalesceKey?: string,
): Command {
  return {
    id: "explore.updateScene",
    label: "Update scene",
    coalesceKey,
    apply(doc) {
      const scene = { ...doc.scene };
      if (patch.title !== undefined) scene.title = patch.title;
      if ("bg" in patch) {
        scene.bg =
          patch.bg === undefined ? undefined : structuredClone(patch.bg);
      }
      return { ...doc, scene };
    },
  };
}

/** Patch project meta (id / title / startScene). Does not replace db arrays. */
export function updateProject(
  patch: { id?: string; title?: string; startScene?: string },
  coalesceKey?: string,
): Command {
  return {
    id: "db.updateProject",
    label: "Update project",
    coalesceKey,
    apply(doc) {
      return {
        ...doc,
        project: {
          ...doc.project,
          ...(patch.id !== undefined ? { id: patch.id } : {}),
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.startScene !== undefined ? { startScene: patch.startScene } : {}),
        },
      };
    },
  };
}
