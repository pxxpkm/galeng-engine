import { describe, expect, it } from "vitest";
import { gotoOptions, parseSceneId } from "./goto";

describe("gotoOptions", () => {
  const scenes = [{ id: "home_01" }, { id: "park_01" }];

  it("lists existing scene ids", () => {
    expect(gotoOptions(scenes, "")).toEqual(["home_01", "park_01"]);
  });

  it("keeps an unknown current target at the front", () => {
    expect(gotoOptions(scenes, "park_02")).toEqual(["park_02", "home_01", "park_01"]);
  });

  it("does not duplicate a known current", () => {
    expect(gotoOptions(scenes, "park_01")).toEqual(["home_01", "park_01"]);
  });
});

describe("parseSceneId", () => {
  it("accepts alnum underscore hyphen", () => {
    expect(parseSceneId("park_02")).toBe("park_02");
    expect(parseSceneId("  A-1  ")).toBe("A-1");
  });

  it("rejects empty or whitespace", () => {
    expect(parseSceneId("")).toBeNull();
    expect(parseSceneId("   ")).toBeNull();
  });

  it("rejects illegal characters", () => {
    expect(parseSceneId("park 02")).toBeNull();
    expect(parseSceneId("../x")).toBeNull();
    expect(parseSceneId("公園")).toBeNull();
  });
});
