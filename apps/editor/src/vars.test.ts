import { describe, expect, it } from "vitest";
import { collectVars, varNames, varsOf } from "./vars";
import type { Scene } from "./types";

const park: Scene = {
  id: "park_01",
  title: "公園・午後",
  beats: [{ say: { speaker: "sora", text: "今天風真好。" } }],
  exit: {
    type: "choices",
    options: [
      { text: "一起走吧", goto: "park_02", set: { sora_affection: "+1" } },
      { text: "該回去了", goto: "home_01", if: { seen: { gte: 1 } } },
    ],
  },
};

const branch: Scene = {
  id: "gate",
  beats: [{ set: { flag: 1 } }],
  exit: { type: "branch", if: { sora_affection: { gte: 1 } }, then: "good", else: "bad" },
};

describe("collectVars", () => {
  it("finds sora_affection on the choice that writes it", () => {
    const sites = collectVars([park]);
    const hits = sites.filter((site) => site.key === "sora_affection");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      sceneId: "park_01",
      kind: "set",
      where: "choice",
      choiceIndex: 0,
    });
  });

  it("collects choice if, branch if, and beat.set", () => {
    const sites = collectVars([park, branch]);
    expect(sites.some((site) => site.key === "seen" && site.kind === "if" && site.choiceIndex === 1)).toBe(
      true,
    );
    expect(sites.some((site) => site.key === "sora_affection" && site.where === "branch")).toBe(true);
    expect(sites.some((site) => site.key === "flag" && site.where === "beat" && site.beatIndex === 0)).toBe(
      true,
    );
  });

  it("skips blank keys", () => {
    const scene: Scene = {
      id: "x",
      beats: [],
      exit: { type: "choices", options: [{ text: "a", goto: "b", set: { "": "+1", "  ": 1 } }] },
    };
    expect(collectVars([scene])).toEqual([]);
  });
});

describe("varsOf", () => {
  it("groups prologue-style affection into one row", () => {
    const rows = varsOf([park, branch]);
    const affection = rows.find((row) => row.key === "sora_affection");
    expect(affection?.count).toBe(2);
    expect(rows.map((row) => row.key)).toEqual(["flag", "seen", "sora_affection"]);
  });
});

describe("varNames", () => {
  it("returns sorted unique keys across set and if sites", () => {
    expect(varNames([park, branch])).toEqual(["flag", "seen", "sora_affection"]);
  });

  it("returns [] when no scene uses vars", () => {
    expect(varNames([{ id: "x", beats: [] }])).toEqual([]);
  });
});
