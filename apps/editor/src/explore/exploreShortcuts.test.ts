import { describe, expect, it } from "vitest";
import { exploreModShortcut } from "./ExploreWorkspace";

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
