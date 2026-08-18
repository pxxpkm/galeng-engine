import { describe, expect, it, vi } from "vitest";
import {
  clampBeatIndex,
  loadScenesForSearch,
  normalizeQuery,
  overlayScenes,
  searchProject,
} from "./search";
import type { Scene } from "./types";

const park: Scene = {
  id: "park_01",
  title: "公園・午後",
  beats: [
    {
      bg: { asset: "bg/park_afternoon" },
      se: [{ asset: "se/breeze" }],
      amb: "amb/rain",
      bgm: { asset: "bgm/park" },
    },
    {
      label: "開場",
      say: { speaker: "sora", text: "今天風真好。", voice: "voice/sora/001" },
    },
    {
      say: { speaker: "sora", text: "要不要一起走走？", voice: "voice/sora/002" },
    },
  ],
  exit: {
    type: "choices",
    options: [
      { text: "一起走吧", goto: "park_02" },
      { text: "該回去了", goto: "home_01" },
    ],
  },
};

const home: Scene = {
  id: "home_01",
  title: "結局",
  beats: [{ say: { speaker: "narrator", text: "回家了。" } }],
};

describe("normalizeQuery", () => {
  it("trims and lowercases", () => {
    expect(normalizeQuery("  Sora  ")).toBe("sora");
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("searchProject", () => {
  it("finds 風真好 on park_01 beat 1", () => {
    const hits = searchProject("風真好", [park, home]);
    expect(hits[0]).toMatchObject({
      sceneId: "park_01",
      beatIndex: 1,
      kind: "text",
      preview: "今天風真好。",
    });
  });

  it("finds voice/sora/001 on the beat that cites it", () => {
    const hits = searchProject("voice/sora/001", [park]);
    expect(hits.some((hit) => hit.sceneId === "park_01" && hit.beatIndex === 1 && hit.kind === "asset")).toBe(
      true,
    );
  });

  it("lists nothing for an empty query", () => {
    expect(searchProject("   ", [park])).toEqual([]);
    expect(searchProject("", [park])).toEqual([]);
  });

  it("lists nothing when nothing matches", () => {
    expect(searchProject("xyzzy-no-such", [park, home])).toEqual([]);
  });

  it("matches scene id and title", () => {
    const byId = searchProject("park_01", [park, home]);
    expect(byId.some((hit) => hit.kind === "scene" && hit.sceneId === "park_01")).toBe(true);
    const byTitle = searchProject("公園", [park]);
    expect(byTitle.some((hit) => hit.kind === "scene" && hit.preview === "公園・午後")).toBe(true);
  });

  it("matches choice text and goto", () => {
    expect(searchProject("一起走吧", [park])[0]).toMatchObject({
      kind: "choice",
      sceneId: "park_01",
      beatIndex: 2,
    });
    expect(searchProject("home_01", [park]).some((hit) => hit.kind === "goto")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(searchProject("SORA", [park]).some((hit) => hit.kind === "speaker")).toBe(true);
  });

  it("indexes unused assets from the library only once", () => {
    const hits = searchProject("se/unused", [park], [
      { logical: "se/unused", kind: "se" },
      { logical: "se/breeze", kind: "se" },
    ]);
    expect(hits).toEqual([
      expect.objectContaining({ sceneId: "", beatIndex: null, kind: "asset", preview: "se/unused" }),
    ]);
    expect(searchProject("se/breeze", [park], [{ logical: "se/breeze", kind: "se" }])[0].sceneId).toBe(
      "park_01",
    );
  });

  it("finds amb path on the beat", () => {
    expect(searchProject("amb/rain", [park])[0]).toMatchObject({
      kind: "asset",
      sceneId: "park_01",
      beatIndex: 0,
      preview: "amb/rain",
    });
  });
});

describe("overlayScenes", () => {
  it("covers the disk scene with the unsaved current one", () => {
    const dirty: Scene = {
      ...park,
      beats: [...park.beats, { say: { speaker: "sora", text: "未存的一句" } }],
    };
    const scenes = overlayScenes([park, home], dirty);
    expect(searchProject("未存的一句", scenes)[0]).toMatchObject({
      sceneId: "park_01",
      beatIndex: 3,
      kind: "text",
    });
    expect(searchProject("風真好", [park])[0].beatIndex).toBe(1);
  });
});

describe("clampBeatIndex", () => {
  it("clamps and treats null as 0", () => {
    expect(clampBeatIndex(null, 3)).toBe(0);
    expect(clampBeatIndex(2, 3)).toBe(2);
    expect(clampBeatIndex(9, 3)).toBe(2);
    expect(clampBeatIndex(-1, 3)).toBe(0);
    expect(clampBeatIndex(1, 0)).toBe(0);
  });
});

describe("loadScenesForSearch", () => {
  it("fetches other scenes and overlays the current one", async () => {
    const fetchScene = vi.fn(async (id: string) => {
      if (id === "home_01") return home;
      throw new Error(`unexpected ${id}`);
    });
    const dirty: Scene = { ...park, title: "未存標題" };
    const loaded = await loadScenesForSearch(
      [{ id: "park_01" }, { id: "home_01" }],
      dirty,
      fetchScene,
    );
    expect(fetchScene).toHaveBeenCalledTimes(1);
    expect(fetchScene).toHaveBeenCalledWith("home_01");
    expect(loaded.find((scene) => scene.id === "park_01")?.title).toBe("未存標題");
    expect(loaded.map((scene) => scene.id)).toEqual(["park_01", "home_01"]);
  });
});
