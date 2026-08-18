import { describe, expect, it } from "vitest";
import { isAudibleLogical } from "./audition";

describe("isAudibleLogical", () => {
  it("accepts voice bgm and se", () => {
    expect(isAudibleLogical("voice/sora/001")).toBe(true);
    expect(isAudibleLogical(" bgm/park ")).toBe(true);
    expect(isAudibleLogical("se/breeze")).toBe(true);
    expect(isAudibleLogical("amb/rain")).toBe(true);
  });

  it("rejects pictures movies and empty", () => {
    expect(isAudibleLogical("bg/park_afternoon")).toBe(false);
    expect(isAudibleLogical("movie/op")).toBe(false);
    expect(isAudibleLogical("cg/op_still")).toBe(false);
    expect(isAudibleLogical("")).toBe(false);
    expect(isAudibleLogical("   ")).toBe(false);
  });
});
