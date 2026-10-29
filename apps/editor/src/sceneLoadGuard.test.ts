import { describe, expect, it } from "vitest";
import {
  departedSceneForLoad,
  departureTicket,
  planSceneLoad,
  sceneDocumentHasLeft,
  sceneLoadKeptForSceneEdit,
} from "./sceneLoadGuard";

describe("sceneLoadKeptForSceneEdit", () => {
  it("loads the next scene when only the project changed", () => {
    expect(
      sceneLoadKeptForSceneEdit({
        openSceneId: "a",
        loadedSceneRev: 3,
        sceneRev: 3,
        sceneDirty: false,
      }),
    ).toBe(false);
  });

  it("keeps the open scene when that scene is dirty", () => {
    expect(
      sceneLoadKeptForSceneEdit({
        openSceneId: "a",
        loadedSceneRev: 3,
        sceneRev: 3,
        sceneDirty: true,
      }),
    ).toBe(true);
  });

  it("keeps the open scene when its revision moved during the request", () => {
    expect(
      sceneLoadKeptForSceneEdit({
        openSceneId: "a",
        loadedSceneRev: 3,
        sceneRev: 4,
        sceneDirty: false,
      }),
    ).toBe(true);
  });

  it("does not restore a scene whose buffer was already cleared", () => {
    expect(
      sceneLoadKeptForSceneEdit({
        openSceneId: null,
        loadedSceneRev: 3,
        sceneRev: 5,
        sceneDirty: true,
      }),
    ).toBe(false);
  });
});

describe("planSceneLoad", () => {
  const base = {
    openSceneId: "a" as string | null,
    loadedSceneRev: 2,
    sceneRev: 2,
    sceneDirty: true,
    liveSceneIds: ["a", "b"],
    departedSceneId: null as string | null,
  };

  it("keeps an edit when the open scene is still live", () => {
    expect(planSceneLoad(base)).toEqual({ apply: false, restoreOpen: true });
  });

  it("does not bounce to an id that left the live list", () => {
    expect(planSceneLoad({ ...base, liveSceneIds: ["b"] })).toEqual({
      apply: true,
      restoreOpen: false,
    });
  });

  it("does not bounce to a scene already left for a copy or a new scene", () => {
    expect(planSceneLoad({ ...base, departedSceneId: "a" })).toEqual({
      apply: true,
      restoreOpen: false,
    });
  });

  it("still restores a clean live scene when the next GET fails", () => {
    expect(planSceneLoad({ ...base, sceneDirty: false })).toEqual({
      apply: true,
      restoreOpen: true,
    });
  });

  it("does not restore a clean scene that has already left the list", () => {
    expect(
      planSceneLoad({ ...base, sceneDirty: false, liveSceneIds: ["b"] }),
    ).toEqual({ apply: true, restoreOpen: false });
  });

  it("does not treat an empty live list as removal", () => {
    expect(planSceneLoad({ ...base, liveSceneIds: [] })).toEqual({
      apply: false,
      restoreOpen: true,
    });
    expect(
      sceneDocumentHasLeft({ sceneId: "a", liveSceneIds: [], departedSceneId: null }),
    ).toBe(false);
  });

  it("applies a load when nothing is open", () => {
    expect(
      planSceneLoad({ ...base, openSceneId: null, sceneDirty: true, sceneRev: 9 }),
    ).toEqual({ apply: true, restoreOpen: true });
  });
});

describe("departure ticket", () => {
  it("ignores a missing or same-scene destination", () => {
    expect(departureTicket("a", "a")).toBeNull();
    expect(departureTicket(null, "b")).toBeNull();
    expect(departureTicket("a", "b")).toEqual({ from: "a", to: "b" });
  });

  it("names the left scene only for the request that replaced it", () => {
    const ticket = { from: "a", to: "b" };
    expect(departedSceneForLoad(ticket, "b")).toBe("a");
    expect(departedSceneForLoad(ticket, "c")).toBeNull();
    expect(departedSceneForLoad(null, "b")).toBeNull();
  });
});
