import { describe, expect, it } from "vitest";
import { addMusicItem, patchFontRole, patchFontScale, setHideGameTitle, setOptionalPath, setPauseButton, setSkipTitle, setTitleButton } from "./project";
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

describe("setTitleButton", () => {
  it("writes one button and leaves the rest unset", () => {
    const next = setTitleButton(base, "newGame", {
      image: "ui/title/start",
      x: 80,
      y: 720,
    });
    expect(next.titleButtons).toEqual({
      newGame: { image: "ui/title/start", label: "", x: 80, y: 720 },
    });
    expect(next.titleBgm).toBe("bgm/park");
  });

  it("clears the last button and drops the object", () => {
    const withBtn = setTitleButton(base, "quit", { label: "Bye" });
    const next = setTitleButton(withBtn, "quit", { label: "" });
    expect(next.titleButtons).toBeUndefined();
  });
});

describe("setPauseButton", () => {
  it("writes one pause button", () => {
    const next = setPauseButton(base, "continue", { image: "ui/pause/cont", x: 80 });
    expect(next.pauseButtons).toEqual({
      continue: { image: "ui/pause/cont", label: "", x: 80 },
    });
    expect(next.titleBgm).toBe("bgm/park");
  });
});

describe("setHideGameTitle", () => {
  it("sets and clears without dropping title fields", () => {
    const on = setHideGameTitle(base, true);
    expect(on.hideGameTitle).toBe(true);
    expect(on.titleBgm).toBe("bgm/park");
    expect(setHideGameTitle(on, false).hideGameTitle).toBeUndefined();
  });
});

describe("addMusicItem", () => {
  it("appends a placeholder row", () => {
    const next = addMusicItem(base);
    expect(next.musicGallery).toEqual([{ id: "bgm_1", asset: "bgm/track" }]);
    expect(next.titleBgm).toBe("bgm/park");
  });
});

describe("patchFontScale", () => {
  it("sets a scale key under fonts.scale", () => {
    const next = patchFontScale(base, "dialogueBody", 40);
    expect(next.fonts?.scale).toEqual({ dialogueBody: 40 });
    expect(next.titleBgm).toBe("bgm/park");
  });

  it("clears a key and omits empty fonts object", () => {
    const set = patchFontScale(base, "speaker", 30);
    const cleared = patchFontScale(set, "speaker", undefined);
    expect(cleared.fonts).toBeUndefined();
  });

  it("clears via NaN the same as undefined", () => {
    const set = patchFontScale(base, "hud", 20);
    const cleared = patchFontScale(set, "hud", Number.NaN);
    expect(cleared.fonts).toBeUndefined();
  });

  it("keeps other roles when clearing the last scale key", () => {
    const withRole = patchFontRole(base, "dialogue", "fonts/mplus");
    const withScale = patchFontScale(withRole, "title", 80);
    const cleared = patchFontScale(withScale, "title", undefined);
    expect(cleared.fonts?.scale).toBeUndefined();
    expect(cleared.fonts?.dialogue).toBe("fonts/mplus");
    expect(cleared.font).toBe("fonts/mplus");
  });

  it("merges multiple scale keys", () => {
    const a = patchFontScale(base, "dialogueBody", 36);
    const b = patchFontScale(a, "menu", 30);
    expect(b.fonts?.scale).toEqual({ dialogueBody: 36, menu: 30 });
  });
});
