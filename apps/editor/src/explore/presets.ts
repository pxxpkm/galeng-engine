/**
 * Preset Browser catalog + pure apply helpers (single Undo via command).
 */

import type { Command } from "./commandBus";
import { setInteraction, uniqueId } from "./commands";
import { defaultTransitionDefaults } from "./transitions";
import type {
  ExploreDoc,
  ExploreAction,
  InteractionRule,
  SceneCatalogEntry,
  TransitionDefaults,
} from "./types";
import { sameOn } from "./types";

export type PresetCategory = "transition" | "hotspot" | "action";

export interface ExplorePreset {
  id: string;
  category: PresetCategory;
  label: string;
  description: string;
}

export const PRESET_CATALOG: ExplorePreset[] = [
  {
    id: "trans.fadeDefaults",
    category: "transition",
    label: "預設淡入黑場",
    description: "將 transitionDefaults 設為 fade_black（Call／Return／Goto）",
  },
  {
    id: "hotspot.pickup",
    category: "hotspot",
    label: "拾取物",
    description: "選中熱區：take → giveItem（首個物品）＋說一句",
  },
  {
    id: "action.callTalk",
    category: "action",
    label: "通話短場",
    description: "選中格：加入 call（目標可再改）＋可選 trans",
  },
  {
    id: "action.return",
    category: "action",
    label: "Return 動作",
    description: "選中格：加入 return（通常用喺對話後；探險格少用）",
  },
];

export function presetsByCategory(cat: PresetCategory): ExplorePreset[] {
  return PRESET_CATALOG.filter((p) => p.category === cat);
}

export function setTransitionDefaults(patch: TransitionDefaults): Command {
  return {
    id: "explore.setTransitionDefaults",
    label: "設轉場預設",
    apply(doc) {
      const prev = doc.project.transitionDefaults ?? {};
      const next: TransitionDefaults = { ...prev, ...patch };
      // normalize empty strings away
      for (const k of ["toDialogue", "fromDialogue", "gotoScene"] as const) {
        if (next[k] === "") delete next[k];
      }
      return {
        ...doc,
        project: { ...doc.project, transitionDefaults: next },
      };
    },
  };
}

function ensureItem(doc: ExploreDoc): { doc: ExploreDoc; itemId: string } {
  if (doc.project.items.length > 0) {
    return { doc, itemId: doc.project.items[0]!.id };
  }
  const taken = new Set(doc.project.items.map((i) => i.id));
  const id = uniqueId("item", taken);
  return {
    doc: {
      ...doc,
      project: {
        ...doc.project,
        items: [...doc.project.items, { id, name: id }],
      },
    },
    itemId: id,
  };
}

/** First dialogue scene that exits back to its caller. */
function returnDialogueId(catalog: SceneCatalogEntry[] | undefined): string | undefined {
  return catalog?.find((entry) => entry.kind === "dialogue" && entry.hasReturn === true)?.id;
}

/** Pure apply; wrapped by applyPreset command. */
export function applyPresetToDoc(
  doc: ExploreDoc,
  presetId: string,
  catalog?: SceneCatalogEntry[],
): ExploreDoc {
  switch (presetId) {
    case "trans.fadeDefaults":
      return setTransitionDefaults(defaultTransitionDefaults()).apply(doc);

    case "hotspot.pickup": {
      const hs = doc.ui.selectedHotspotId ?? doc.ui.selectedCell?.hotspotId;
      if (!hs) return doc;
      const { doc: withItem, itemId } = ensureItem(doc);
      const rules: InteractionRule[] = [
        {
          when: [],
          do: [
            { type: "giveItem", id: itemId },
            { type: "say", text: `拎到${itemId}。` },
          ],
        },
      ];
      return setInteraction(hs, { verb: "take" }, rules).apply(withItem);
    }

    case "action.callTalk": {
      const cell = doc.ui.selectedCell;
      if (!cell) return doc;
      const sceneId = returnDialogueId(catalog);
      if (!sceneId) return doc;
      const existing =
        doc.scene.interactions.find(
          (i) => i.hotspot === cell.hotspotId && sameOn(i.on, cell.on),
        )?.rules ?? [];
      const call: ExploreAction = {
        type: "call",
        scene: sceneId,
        trans: doc.project.transitionDefaults?.toDialogue,
      };
      const rules: InteractionRule[] =
        existing.length === 0
          ? [{ when: [], do: [call] }]
          : existing.map((r, i) =>
              i === 0 ? { ...r, do: [...r.do, call] } : r,
            );
      return setInteraction(cell.hotspotId, cell.on, rules).apply(doc);
    }

    case "action.return": {
      const cell = doc.ui.selectedCell;
      if (!cell) return doc;
      const existing =
        doc.scene.interactions.find(
          (i) => i.hotspot === cell.hotspotId && sameOn(i.on, cell.on),
        )?.rules ?? [];
      const ret: ExploreAction = {
        type: "return",
        trans: doc.project.transitionDefaults?.fromDialogue,
      };
      const rules: InteractionRule[] =
        existing.length === 0
          ? [{ when: [], do: [ret] }]
          : existing.map((r, i) =>
              i === 0 ? { ...r, do: [...r.do, ret] } : r,
            );
      return setInteraction(cell.hotspotId, cell.on, rules).apply(doc);
    }

    default:
      return doc;
  }
}

export function applyPreset(presetId: string, catalog?: SceneCatalogEntry[]): Command {
  const meta = PRESET_CATALOG.find((p) => p.id === presetId);
  return {
    id: `explore.applyPreset.${presetId}`,
    label: meta ? `Preset: ${meta.label}` : `Preset ${presetId}`,
    apply(doc) {
      return applyPresetToDoc(doc, presetId, catalog);
    },
  };
}
