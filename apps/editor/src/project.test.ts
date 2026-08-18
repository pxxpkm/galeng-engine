import { describe, expect, it } from "vitest";
import { addMusicItem, setOptionalPath, setSkipTitle } from "./project";
import type { Project } from "./types";

const base: Project = {
  id: "example-prologue",
  title: "Prologue",
  schemaVersion: 1,
  resolution: { width: 1920, height: 1080 },
  startScene: "park_01",
  locale: "zh-Hant",
  titleBgm: "bgm/park",
  titleBg: "bg/park_afternoon",
  titleMovie: "movie/op",
};

describe("setOptionalPath", () => {
  it("clears titleBgm without dropping titleMovie", () => {
    const next = setOptionalPath(base, "titleBgm", "  ");
    expect(next.titleBgm).toBeUndefined();
    expect(next.titleMovie).toBe("movie/op");
    expect(next.titleBg).toBe("bg/park_afternoon");
  });

  it("writes a path", () => {
    const next = setOptionalPath(base, "titleMovie", "movie/ed");
    expect(next.titleMovie).toBe("movie/ed");
    expect(next.titleBgm).toBe("bgm/park");
  });

  it("writes and clears project font", () => {
    const set = setOptionalPath(base, "font", "fonts/mplus");
    expect(set.font).toBe("fonts/mplus");
    expect(setOptionalPath(set, "font", "  ").font).toBeUndefined();
  });

  it("writes and clears msgBox", () => {
    const set = setOptionalPath(base, "msgBox", "ui/msgbox");
    expect(set.msgBox).toBe("ui/msgbox");
    expect(setOptionalPath(set, "msgBox", "").msgBox).toBeUndefined();
  });

  it("writes and clears icon", () => {
    const set = setOptionalPath(base, "icon", "ui/icon");
    expect(set.icon).toBe("ui/icon");
    expect(setOptionalPath(set, "icon", "").icon).toBeUndefined();
  });
});

describe("setSkipTitle", () => {
  it("toggles without dropping title fields", () => {
    const next = setSkipTitle(base, true);
    expect(next.skipTitle).toBe(true);
    expect(next.titleBgm).toBe("bgm/park");
  });
});

describe("addMusicItem", () => {
  it("appends a placeholder row", () => {
    const next = addMusicItem(base);
    expect(next.musicGallery).toEqual([{ id: "bgm_1", asset: "bgm/track" }]);
    expect(next.titleBgm).toBe("bgm/park");
  });
});
