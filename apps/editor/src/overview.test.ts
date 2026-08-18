import { describe, expect, it } from "vitest";
import { buildOverview, canJumpCite, collectCites, overviewOf } from "./overview";
import type { AssetMeta, Project, Scene } from "./types";

const park: Scene = {
  id: "park_01",
  title: "公園・午後",
  beats: [
    {
      bg: { asset: "bg/park_afternoon" },
      chars: [{ id: "sora", face: "smile", slot: "center" }],
      bgm: { asset: "bgm/park" },
      se: [{ asset: "se/breeze" }],
      cg: "cg/op_still",
    },
    {
      say: { speaker: "sora", text: "今天風真好。", voice: "voice/sora/001" },
    },
  ],
};

const project: Project = {
  id: "example-prologue",
  title: "Prologue",
  startScene: "park_01",
  locale: "zh-Hant",
  titleBg: "bg/park_afternoon",
  titleBgm: "bgm/park",
  characters: [{ id: "sora", display: { en: "Sora" } }],
  cg: [{ id: "op_still", asset: "cg/op_still" }],
};

const assets: AssetMeta[] = [
  { logical: "bg/park_afternoon", kind: "image" },
  { logical: "bgm/park", kind: "audio" },
  { logical: "se/breeze", kind: "audio" },
  { logical: "voice/sora/001", kind: "audio" },
  { logical: "char/sora/smile", kind: "image" },
  { logical: "cg/op_still", kind: "image" },
  { logical: "bg/unused_sky", kind: "image" },
];

describe("collectCites", () => {
  it("counts park_afternoon from the beat and the project title bg", () => {
    const cites = collectCites(project, [park]);
    const parkBg = cites.filter((site) => site.logical === "bg/park_afternoon");
    expect(parkBg.length).toBeGreaterThanOrEqual(1);
    expect(parkBg.some((site) => site.sceneId === "park_01" && site.beatIndex === 0)).toBe(true);
    expect(parkBg.some((site) => site.field === "titleBg" && !site.sceneId)).toBe(true);
  });

  it("does not cite roster ids as paths", () => {
    const cites = collectCites(project, [park]);
    expect(cites.some((site) => site.logical === "sora")).toBe(false);
  });

  it("skips empty paths, null cg, and stopped bgm", () => {
    const empty: Scene = {
      id: "empty",
      beats: [
        { bg: { asset: "  " }, cg: null, amb: null, bgm: { asset: null }, say: { speaker: "sora", text: "x" } },
      ],
    };
    expect(collectCites(null, [empty])).toEqual([]);
  });

  it("cites amb path", () => {
    const rainy: Scene = {
      id: "rain",
      beats: [{ amb: "amb/rain" }],
    };
    const cites = collectCites(null, [rainy]);
    expect(cites).toEqual([
      expect.objectContaining({ logical: "amb/rain", field: "amb", sceneId: "rain", beatIndex: 0 }),
    ]);
  });
});

describe("buildOverview", () => {
  it("marks used, orphan, and missing", () => {
    const missingScene: Scene = {
      id: "ghost",
      beats: [{ bg: { asset: "bg/nope" } }],
    };
    const rows = overviewOf(project, [park, missingScene], assets);
    expect(rows.find((row) => row.logical === "bg/park_afternoon")).toMatchObject({
      status: "used",
      count: 2,
    });
    expect(rows.find((row) => row.logical === "bg/unused_sky")).toMatchObject({
      status: "orphan",
      count: 0,
    });
    expect(rows.find((row) => row.logical === "bg/nope")).toMatchObject({
      status: "missing",
      count: 1,
    });
  });

  it("lists missing before used before orphan", () => {
    const rows = buildOverview(
      [{ logical: "bg/used", field: "bg", sceneId: "a", beatIndex: 0 }],
      [
        { logical: "bg/used", kind: "image" },
        { logical: "bg/orphan", kind: "image" },
      ],
    );
    const withMissing = buildOverview(
      [
        { logical: "bg/used", field: "bg", sceneId: "a", beatIndex: 0 },
        { logical: "bg/gone", field: "bg", sceneId: "a", beatIndex: 1 },
      ],
      [
        { logical: "bg/used", kind: "image" },
        { logical: "bg/orphan", kind: "image" },
      ],
    );
    expect(rows.map((row) => row.status)).toEqual(["used", "orphan"]);
    expect(withMissing.map((row) => row.logical)).toEqual(["bg/gone", "bg/used", "bg/orphan"]);
  });
});

describe("canJumpCite", () => {
  it("only jumps sites that name a scene", () => {
    expect(canJumpCite({ logical: "bg/park_afternoon", field: "bg", sceneId: "park_01", beatIndex: 0 })).toBe(
      true,
    );
    expect(canJumpCite({ logical: "bg/park_afternoon", field: "titleBg" })).toBe(false);
  });
});
