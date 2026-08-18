import { describe, expect, it } from "vitest";
import {
  addCharacter,
  affectionDeltaOf,
  affectionKey,
  patchCharacter,
  removeCharacter,
  setAffectionDelta,
  speakerOptions,
} from "./roster";
import type { Project } from "./types";

const base: Project = {
  id: "p",
  title: "P",
  startScene: "a",
  locale: "zh-Hant",
  characters: [{ id: "sora", display: { "zh-Hant": "そら", en: "Sora" } }],
};

describe("affectionKey", () => {
  it("uses id_affection", () => {
    expect(affectionKey("sora")).toBe("sora_affection");
    expect(affectionKey(" sora ")).toBe("sora_affection");
  });
});

describe("speakerOptions", () => {
  it("lists ids and keeps a stray current value", () => {
    expect(speakerOptions(base.characters ?? [], "sora")).toEqual(["sora"]);
    expect(speakerOptions(base.characters ?? [], "narrator")).toEqual(["narrator", "sora"]);
  });
});

describe("addCharacter / removeCharacter / patchCharacter", () => {
  it("appends a unique id and can remove the last row", () => {
    const added = addCharacter(base);
    expect(added.characters?.map((c) => c.id)).toEqual(["sora", "char_2"]);
    const gone = removeCharacter(added, 0);
    expect(gone.characters?.map((c) => c.id)).toEqual(["char_2"]);
    const empty = removeCharacter(gone, 0);
    expect(empty.characters).toBeUndefined();
    expect(empty.title).toBe("P");
  });

  it("patches id and display without dropping other locales", () => {
    const next = patchCharacter(base, 0, { displayLocale: "zh-Hans", displayName: "空" });
    expect(next.characters?.[0]).toEqual({
      id: "sora",
      display: { "zh-Hant": "そら", en: "Sora", "zh-Hans": "空" },
    });
    const cleared = patchCharacter(next, 0, { displayLocale: "en", displayName: "  " });
    expect(cleared.characters?.[0]?.display).toEqual({ "zh-Hant": "そら", "zh-Hans": "空" });
    const renamed = patchCharacter(base, 0, { id: " sora2 " });
    expect(renamed.characters?.[0]?.id).toBe("sora2");
    const blank = patchCharacter(base, 0, { id: "   " });
    expect(blank.characters?.[0]?.id).toBe("sora");
    const paced = patchCharacter(base, 0, { textRate: 80 });
    expect(paced.characters?.[0]?.textRate).toBe(80);
    const unpaced = patchCharacter(paced, 0, { textRate: null });
    expect(unpaced.characters?.[0]?.textRate).toBeUndefined();
  });
});

describe("setAffectionDelta", () => {
  it("writes +1 / -1 and deletes on 0", () => {
    const plus = setAffectionDelta(undefined, "sora", 1);
    expect(plus).toEqual({ sora_affection: "+1" });
    expect(affectionDeltaOf(plus, "sora")).toBe(1);
    const minus = setAffectionDelta(plus, "sora", -1);
    expect(minus).toEqual({ sora_affection: "-1" });
    expect(affectionDeltaOf(minus, "sora")).toBe(-1);
    const cleared = setAffectionDelta(minus, "sora", 0);
    expect(cleared).toBeUndefined();
    expect(affectionDeltaOf(cleared, "sora")).toBe(0);
  });

  it("keeps other set keys", () => {
    const next = setAffectionDelta({ flag: 1, sora_affection: "+1" }, "sora", 0);
    expect(next).toEqual({ flag: 1 });
  });
});
