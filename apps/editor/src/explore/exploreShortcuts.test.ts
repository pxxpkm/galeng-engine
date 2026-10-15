import { describe, expect, it } from "vitest";
import { exploreCanvasKeyAction, exploreModShortcut } from "./ExploreWorkspace";

describe("exploreModShortcut", () => {
  it("Ctrl+S saves even inside INPUT/TEXTAREA", () => {
    expect(
      exploreModShortcut("s", { inEditableField: true, hasPersist: true }),
    ).toBe("save");
    expect(
      exploreModShortcut("S", { inEditableField: true, hasPersist: true }),
    ).toBe("save");
  });

  it("Ctrl+S is no-op without persist", () => {
    expect(
      exploreModShortcut("s", { inEditableField: true, hasPersist: false }),
    ).toBeNull();
  });

  it("Ctrl+C/V/Z stay native inside editable fields", () => {
    expect(
      exploreModShortcut("c", { inEditableField: true, hasPersist: true }),
    ).toBeNull();
    expect(
      exploreModShortcut("v", { inEditableField: true, hasPersist: true }),
    ).toBeNull();
    expect(
      exploreModShortcut("z", { inEditableField: true, hasPersist: true }),
    ).toBeNull();
  });

  it("Ctrl+C/V/Z work outside fields", () => {
    expect(
      exploreModShortcut("c", { inEditableField: false, hasPersist: true }),
    ).toBe("copy");
    expect(
      exploreModShortcut("v", { inEditableField: false, hasPersist: true }),
    ).toBe("paste");
    expect(
      exploreModShortcut("z", { inEditableField: false, hasPersist: true }),
    ).toBe("undo");
    expect(
      exploreModShortcut("z", {
        inEditableField: false,
        hasPersist: true,
        shiftKey: true,
      }),
    ).toBe("redo");
  });
});

describe("exploreCanvasKeyAction", () => {
  it("ignores editable fields and missing selection", () => {
    expect(
      exploreCanvasKeyAction("Delete", {
        inEditableField: true,
        hasHotspotSelection: true,
      }),
    ).toBeNull();
    expect(
      exploreCanvasKeyAction("ArrowLeft", {
        inEditableField: false,
        hasHotspotSelection: false,
      }),
    ).toBeNull();
  });

  it("maps Delete / Backspace to delete", () => {
    expect(
      exploreCanvasKeyAction("Delete", {
        inEditableField: false,
        hasHotspotSelection: true,
      }),
    ).toEqual({ type: "delete" });
    expect(
      exploreCanvasKeyAction("Backspace", {
        inEditableField: false,
        hasHotspotSelection: true,
      }),
    ).toEqual({ type: "delete" });
  });

  it("nudges by 1, or 10 with Shift", () => {
    expect(
      exploreCanvasKeyAction("ArrowLeft", {
        inEditableField: false,
        hasHotspotSelection: true,
      }),
    ).toEqual({ type: "nudge", dx: -1, dy: 0 });
    expect(
      exploreCanvasKeyAction("ArrowRight", {
        inEditableField: false,
        hasHotspotSelection: true,
        shiftKey: true,
      }),
    ).toEqual({ type: "nudge", dx: 10, dy: 0 });
    expect(
      exploreCanvasKeyAction("ArrowUp", {
        inEditableField: false,
        hasHotspotSelection: true,
      }),
    ).toEqual({ type: "nudge", dx: 0, dy: -1 });
    expect(
      exploreCanvasKeyAction("ArrowDown", {
        inEditableField: false,
        hasHotspotSelection: true,
        shiftKey: true,
      }),
    ).toEqual({ type: "nudge", dx: 0, dy: 10 });
  });
});
