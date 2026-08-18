import { describe, expect, it } from "vitest";
import { charLogical, fitBottomCenter, mediaUrl } from "./media";

describe("mediaUrl", () => {
  it("encodes each path segment", () => {
    expect(mediaUrl("bg/park_afternoon")).toBe("/api/media/bg/park_afternoon");
    expect(charLogical("sora", "smile")).toBe("char/sora/smile");
  });
});

describe("fitBottomCenter", () => {
  it("matches the player slot fit", () => {
    const box = fitBottomCenter(10, 20, 0, 0, 100, 100);
    expect(box).toEqual({ x: 25, y: 0, w: 50, h: 100 });
  });
});
