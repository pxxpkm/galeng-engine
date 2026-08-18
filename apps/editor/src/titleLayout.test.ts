import { describe, expect, it } from "vitest";
import {
  defaultPauseRect,
  defaultTitleRect,
  previewScale,
  previewToStage,
  resolvedTitleRect,
  snapCoord,
  snapPosition,
  stageToPreview,
  titleCaption,
} from "./titleLayout";

describe("titleLayout", () => {
  it("keeps the player default box", () => {
    expect(defaultTitleRect(0)).toEqual({ x: 660, y: 400, w: 600, h: 56 });
    expect(defaultTitleRect(1).y).toBe(468);
    expect(defaultPauseRect(0)).toEqual({ x: 660, y: 200, w: 600, h: 52 });
    expect(defaultPauseRect(1).y).toBe(260);
  });

  it("fills missing x/y from the default and image size for w/h", () => {
    expect(resolvedTitleRect(0, { image: "ui/title/start" }, { w: 320, h: 64 })).toEqual({
      x: 660,
      y: 400,
      w: 320,
      h: 64,
    });
    expect(resolvedTitleRect(0, { x: 80, y: 720, w: 200, h: 40 })).toEqual({
      x: 80,
      y: 720,
      w: 200,
      h: 40,
    });
  });

  it("converts preview pixels to 1080p integers", () => {
    const scale = previewScale(960);
    expect(scale).toBe(0.5);
    expect(stageToPreview(660, scale)).toBe(330);
    expect(previewToStage(330, scale)).toBe(660);
  });

  it("snaps x or y to a nearby button", () => {
    expect(snapCoord(84, [80, 400])).toBe(80);
    expect(snapCoord(100, [80, 400])).toBe(100);
    expect(snapPosition(82, 718, [{ x: 80, y: 720 }])).toEqual({ x: 80, y: 720 });
  });

  it("uses an empty label when the image has baked text", () => {
    expect(titleCaption("zh-Hant", "newGame", { label: "", image: "ui/title/start" })).toBe("");
    expect(titleCaption("en", "newGame")).toBe("New game");
  });
});
