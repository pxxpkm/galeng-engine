import { describe, expect, it } from "vitest";
import { sceneLoadKeptForSceneEdit } from "./sceneLoadGuard";

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
