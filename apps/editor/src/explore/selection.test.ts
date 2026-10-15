import { describe, expect, it } from "vitest";
import { emptyUi } from "./types";
import { selectionAfterCellPick, selectionAfterHotspotPick } from "./selection";

describe("selectionAfterHotspotPick", () => {
  it("selects hotspot only when no cell was selected", () => {
    const ui = emptyUi();
    expect(selectionAfterHotspotPick(ui, "desk")).toEqual({
      selectedHotspotId: "desk",
      selectedCell: null,
    });
  });

  it("rebinds cell on (verb) to the newly selected hotspot", () => {
    const ui = {
      ...emptyUi(),
      selectedHotspotId: "desk",
      selectedCell: { hotspotId: "desk", on: { verb: "look" as const } },
    };
    expect(selectionAfterHotspotPick(ui, "door")).toEqual({
      selectedHotspotId: "door",
      selectedCell: { hotspotId: "door", on: { verb: "look" } },
    });
  });

  it("rebinds item-on the same way", () => {
    const ui = {
      ...emptyUi(),
      selectedHotspotId: "chest",
      selectedCell: { hotspotId: "chest", on: { item: "key" } },
    };
    expect(selectionAfterHotspotPick(ui, "desk")).toEqual({
      selectedHotspotId: "desk",
      selectedCell: { hotspotId: "desk", on: { item: "key" } },
    });
  });

  it("clears both when hotspot is deselected", () => {
    const ui = {
      ...emptyUi(),
      selectedHotspotId: "desk",
      selectedCell: { hotspotId: "desk", on: { verb: "look" } },
    };
    expect(selectionAfterHotspotPick(ui, null)).toEqual({
      selectedHotspotId: null,
      selectedCell: null,
    });
  });
});

describe("selectionAfterCellPick", () => {
  it("sets hotspot and cell together", () => {
    expect(selectionAfterCellPick("npc", { verb: "talk" })).toEqual({
      selectedHotspotId: "npc",
      selectedCell: { hotspotId: "npc", on: { verb: "talk" } },
    });
  });
});
