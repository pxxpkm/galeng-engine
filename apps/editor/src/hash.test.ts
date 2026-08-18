import { describe, expect, it } from "vitest";
import { hashRgb } from "./hash";

describe("hashRgb", () => {
  it("is stable for the same key", () => {
    expect(hashRgb("bg/park_afternoon")).toBe(hashRgb("bg/park_afternoon"));
  });
});
