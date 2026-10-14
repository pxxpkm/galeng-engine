import { describe, expect, it } from "vitest";
import { exploreCanvasBgSrc } from "./ExploreCanvas";

describe("exploreCanvasBgSrc", () => {
  it("maps scene.bg.asset to host /api/media URL", () => {
    expect(exploreCanvasBgSrc({ asset: "bg/study" })).toBe("/api/media/bg/study");
    expect(exploreCanvasBgSrc({ asset: "bg/room" })).toBe("/api/media/bg/room");
  });

  it("returns null when bg unset or asset blank", () => {
    expect(exploreCanvasBgSrc(undefined)).toBeNull();
    expect(exploreCanvasBgSrc(null)).toBeNull();
    expect(exploreCanvasBgSrc({ asset: "" })).toBeNull();
    expect(exploreCanvasBgSrc({ asset: "   " })).toBeNull();
  });

  it("encodes path segments like dialogue Preview", () => {
    expect(exploreCanvasBgSrc({ asset: "bg/park afternoon" })).toBe(
      "/api/media/bg/park%20afternoon",
    );
  });
});
