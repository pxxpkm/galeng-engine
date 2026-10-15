/**
 * Pure UI selection helpers for Explore Inspector dual context (M1).
 * JSON / scene data unchanged — only selectedHotspotId + selectedCell.
 */

import type { ExploreUi, InteractionOn } from "./types";

export type SelectionPatch = Pick<ExploreUi, "selectedHotspotId" | "selectedCell">;

/**
 * Canvas / hierarchy / matrix row: pick a hotspot.
 * Keeps the previous cell's `on` (verb/item) and rebinds hotspotId so
 * CellInspector stays available for the same verb on the new hotspot.
 * Clearing (null) clears both hotspot and cell.
 */
export function selectionAfterHotspotPick(
  ui: ExploreUi,
  hotspotId: string | null,
): SelectionPatch {
  if (hotspotId === null) {
    return { selectedHotspotId: null, selectedCell: null };
  }
  if (ui.selectedCell) {
    return {
      selectedHotspotId: hotspotId,
      selectedCell: { hotspotId, on: ui.selectedCell.on },
    };
  }
  return { selectedHotspotId: hotspotId, selectedCell: null };
}

/** Matrix cell click: select hotspot + that verb/item cell together. */
export function selectionAfterCellPick(
  hotspotId: string,
  on: InteractionOn,
): SelectionPatch {
  return {
    selectedHotspotId: hotspotId,
    selectedCell: { hotspotId, on },
  };
}
