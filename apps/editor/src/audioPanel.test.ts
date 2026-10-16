import { describe, expect, it } from "vitest";
import {
  audioKindOf,
  citeCountMap,
  listAudioLogicals,
  patchMusicGalleryItem,
  removeMusicGalleryItem,
} from "./audioPanel";
import type { AssetMeta, Project } from "./types";

const assets: AssetMeta[] = [
  { logical: "bgm/park", kind: "audio" },
  { logical: "se/breeze", kind: "audio" },
  { logical: "amb/rain", kind: "audio" },
  { logical: "voice/sora/001", kind: "audio" },
  { logical: "bg/home", kind: "image" },
  { logical: "fonts/mplus", kind: "font" },
];

const base: Project = {
  id: "demo",
  title: "Demo",
  startScene: "s1",
  locale: "zh-Hant",
  titleBgm: "bgm/park",
  musicGallery: [
    { id: "bgm_1", asset: "bgm/park" },
    { id: "bgm_2", asset: "bgm/night" },
  ],
};

describe("audioKindOf", () => {
  it("maps known audio prefixes", () => {
    expect(audioKindOf("bgm/park")).toBe("bgm");
    expect(audioKindOf("se/breeze")).toBe("se");
    expect(audioKindOf("amb/rain")).toBe("amb");
    expect(audioKindOf("voice/sora/001")).toBe("voice");
  });

  it("returns null for non-audio paths", () => {
    expect(audioKindOf("bg/home")).toBeNull();
    expect(audioKindOf("fonts/mplus")).toBeNull();
    expect(audioKindOf("")).toBeNull();
  });
});

describe("listAudioLogicals", () => {
  it("lists all audio kinds in bgm→se→amb→voice order", () => {
    expect(listAudioLogicals(assets, "all")).toEqual([
      "bgm/park",
      "se/breeze",
      "amb/rain",
      "voice/sora/001",
    ]);
  });

  it("filters by kind", () => {
    expect(listAudioLogicals(assets, "bgm")).toEqual(["bgm/park"]);
    expect(listAudioLogicals(assets, "se")).toEqual(["se/breeze"]);
    expect(listAudioLogicals(assets, "amb")).toEqual(["amb/rain"]);
    expect(listAudioLogicals(assets, "voice")).toEqual(["voice/sora/001"]);
  });

  it("returns empty when no matching assets", () => {
    expect(listAudioLogicals([{ logical: "bg/home", kind: "image" }], "all")).toEqual([]);
  });
});

describe("patchMusicGalleryItem / removeMusicGalleryItem", () => {
  it("patches a row by index", () => {
    const next = patchMusicGalleryItem(base, 1, { id: "theme", asset: "bgm/theme" });
    expect(next.musicGallery).toEqual([
      { id: "bgm_1", asset: "bgm/park" },
      { id: "theme", asset: "bgm/theme" },
    ]);
    expect(next.titleBgm).toBe("bgm/park");
  });

  it("no-ops on out-of-range patch", () => {
    expect(patchMusicGalleryItem(base, 9, { id: "x", asset: "bgm/x" })).toBe(base);
    expect(patchMusicGalleryItem(base, -1, { id: "x", asset: "bgm/x" })).toBe(base);
  });

  it("removes a row by index", () => {
    const next = removeMusicGalleryItem(base, 0);
    expect(next.musicGallery).toEqual([{ id: "bgm_2", asset: "bgm/night" }]);
  });

  it("no-ops on out-of-range remove", () => {
    expect(removeMusicGalleryItem(base, 5)).toBe(base);
  });
});

describe("citeCountMap", () => {
  it("maps logical → count", () => {
    const map = citeCountMap([
      { logical: "bgm/park", count: 3 },
      { logical: "se/breeze", count: 0 },
    ]);
    expect(map.get("bgm/park")).toBe(3);
    expect(map.get("se/breeze")).toBe(0);
    expect(map.get("missing")).toBeUndefined();
  });
});
