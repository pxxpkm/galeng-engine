import { describe, expect, it } from "vitest";
import { exploreNewSceneIdError, parseNewExploreSceneId } from "./sceneId";

describe("exploreNewSceneIdError", () => {
  const existing = ["hall", "study"];

  it("rejects empty", () => {
    expect(exploreNewSceneIdError("", existing)).toBe("場景 ID 不可為空");
    expect(exploreNewSceneIdError("  ", existing)).toBe("場景 ID 不可為空");
  });

  it("rejects illegal characters with Chinese message", () => {
    const msg = exploreNewSceneIdError("房間2", existing);
    expect(msg).toContain("英數");
    expect(exploreNewSceneIdError("room 2", existing)).toContain("英數");
  });

  it("rejects duplicates", () => {
    expect(exploreNewSceneIdError("hall", existing)).toBe("場景「hall」已存在於目錄");
  });

  it("accepts valid new id", () => {
    expect(exploreNewSceneIdError("room_2", existing)).toBeNull();
    expect(parseNewExploreSceneId("  attic-1  ", existing)).toBe("attic-1");
  });
});
