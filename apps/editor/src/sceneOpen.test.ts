import { describe, expect, it } from "vitest";
import { exploreDocForNewRoom } from "./sceneOpen";

describe("exploreDocForNewRoom", () => {
  const raw = {
    id: "click-room",
    title: "Click",
    schemaVersion: 2,
    startScene: "study",
    locale: "zh-Hant",
    verbs: [{ id: "look", label: "睇" }],
  };

  it("keeps the real project and writes an explore room, not a dialogue file", () => {
    const doc = exploreDocForNewRoom(raw, "room_2", "Side room");
    expect(doc.project.id).toBe("click-room");
    expect(doc.project.startScene).toBe("study");
    expect(doc.project.id).not.toBe("demo");
    expect(doc.scene.id).toBe("room_2");
    expect(doc.scene.sceneKind).toBe("explore");
    expect(doc.scene.title).toBe("Side room");
    expect(doc._rawProject).toBe(raw);
  });

  it("uses the blank room title when the display title is empty", () => {
    const doc = exploreDocForNewRoom(raw, "room_3", "  ");
    expect(doc.scene.title).toBe("新房間");
    expect(doc.scene.id).toBe("room_3");
    expect(doc.project.startScene).toBe("study");
  });
});
