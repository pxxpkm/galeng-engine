import { describe, expect, it } from "vitest";
import { canArchiveScene, canDeleteScene, duplicateScene, nextSceneAfterArchive } from "./scene";
import type { Scene } from "./types";

const park: Scene = {
  id: "park_01",
  title: "公園・午後",
  beats: [
    { bg: { asset: "bg/park_afternoon" } },
    { say: { speaker: "sora", text: "今天風真好。", voice: "voice/sora/001" } },
  ],
  exit: {
    type: "choices",
    options: [{ text: "一起走吧", goto: "park_02", set: { sora_affection: "+1" } }],
  },
};

describe("archive helpers", () => {
  it("refuses the start scene", () => {
    expect(canArchiveScene("park_01", "park_01")).toBe(false);
    expect(canArchiveScene("home_01", "park_01")).toBe(true);
    expect(canArchiveScene("home_01", undefined)).toBe(false);
    expect(canDeleteScene("park_01", "park_01")).toBe(false);
    expect(canDeleteScene("home_01", "park_01")).toBe(true);
  });

  it("jumps to start after archiving the current scene", () => {
    expect(nextSceneAfterArchive("home_01", "home_01", "park_01", ["park_01", "park_02"])).toBe(
      "park_01",
    );
    expect(nextSceneAfterArchive("park_01", "home_01", "park_01", ["park_01"])).toBe("park_01");
  });
});

describe("duplicateScene", () => {
  it("copies park_01 content under a new id", () => {
    const next = duplicateScene(park, "park_01b");
    expect(next).not.toBeNull();
    expect(next?.id).toBe("park_01b");
    expect(next?.title).toBe("公園・午後");
    expect(next?.beats).toEqual(park.beats);
    expect(next?.exit).toEqual(park.exit);
    expect(next?.beats).not.toBe(park.beats);
    expect(next?.exit).not.toBe(park.exit);
  });

  it("does not mutate the source", () => {
    const next = duplicateScene(park, "park_01b");
    next!.beats[0] = { label: "changed" };
    next!.title = "改過";
    expect(park.beats[0]).toEqual({ bg: { asset: "bg/park_afternoon" } });
    expect(park.title).toBe("公園・午後");
    expect(park.id).toBe("park_01");
  });

  it("rejects a bad id or the same id", () => {
    expect(duplicateScene(park, "")).toBeNull();
    expect(duplicateScene(park, "公園")).toBeNull();
    expect(duplicateScene(park, "park 01")).toBeNull();
    expect(duplicateScene(park, "park_01")).toBeNull();
    expect(duplicateScene(park, "  park_01  ")).toBeNull();
  });
});
