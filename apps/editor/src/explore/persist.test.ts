import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import {
  addHotspot,
  addItem,
  setInteraction,
  setOnEmptyClick,
  setOnEnter,
  updateScene,
} from "./commands";
import { blankExploreDoc } from "./fixture";
import {
  apiToExploreScene,
  exploreProjectToApi,
  exploreSceneToApi,
  loadExploreDoc,
  loadSiblingExploreScenes,
  saveExploreDoc,
} from "./persist";
import { createFsPersistApi } from "./persistFs";
import { BEAT_ID_RE } from "../beats";

describe("Explore persist (real file path)", () => {
  it("save → disk files → load round-trip", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "plane-explore-"));
    const api = createFsPersistApi(root);

    let doc = blankExploreDoc("study");
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({
        id: "desk",
        name: "書桌",
        shape: { type: "rect", x: 10, y: 20, w: 100, h: 80 },
      }),
    ));
    ({ bus, doc } = dispatch(bus, doc, addItem({ id: "key", name: "鎖匙" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("desk", { verb: "look" }, [
        { when: [], do: [{ type: "say", text: "一張舊書桌。" }] },
      ]),
    ));
    void bus;

    await saveExploreDoc(api, doc);

    const projectPath = path.join(root, "galeng.json");
    const scenePath = path.join(root, "scenario", "study.json");
    const projectText = await readFile(projectPath, "utf8");
    const sceneText = await readFile(scenePath, "utf8");
    expect(projectText).toContain('"schemaVersion": 2');
    expect(projectText).toContain('"key"');
    expect(sceneText).toContain('"sceneKind": "explore"');
    expect(sceneText).toContain("一張舊書桌。");

    const loaded = await loadExploreDoc(api, "study");
    expect(loaded.scene.hotspots.map((h) => h.id)).toEqual(["desk"]);
    expect(loaded.scene.interactions).toHaveLength(1);
    expect(loaded.project.items[0]?.id).toBe("key");
    expect(JSON.stringify(loaded.scene.interactions)).toBe(
      JSON.stringify(doc.scene.interactions),
    );
  });

  it("mutating disk then reload proves file path (not memory)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "plane-explore-"));
    const api = createFsPersistApi(root);
    let doc = blankExploreDoc("study");
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({ id: "lamp", name: "燈", shape: { type: "rect", x: 1, y: 1, w: 50, h: 50 } }),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("lamp", { verb: "look" }, [
        { when: [], do: [{ type: "say", text: "original" }] },
      ]),
    ));
    void bus;
    await saveExploreDoc(api, doc);

    const scenePath = path.join(root, "scenario", "study.json");
    const raw = JSON.parse(await readFile(scenePath, "utf8")) as {
      interactions: { rules: { do: { type: string; text?: string }[] }[] }[];
    };
    raw.interactions[0]!.rules[0]!.do[0] = { type: "say", text: "from-disk" };
    await writeFile(scenePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    const reloaded = await loadExploreDoc(api, "study");
    const say = reloaded.scene.interactions[0]?.rules[0]?.do[0];
    expect(say).toEqual({ type: "say", text: "from-disk" });
  });

  it("exploreSceneToApi defaults beats to [] when raw has none", () => {
    const scene = blankExploreDoc("r").scene;
    const api = exploreSceneToApi(scene);
    expect(api.beats).toEqual([]);
    expect(api.sceneKind).toBe("explore");
    const back = apiToExploreScene(api);
    expect(back.sceneKind).toBe("explore");
    expect(back.id).toBe("r");
  });

  it("exploreSceneToApi preserves raw beats (does not wipe)", () => {
    const scene = blankExploreDoc("r").scene;
    const api = exploreSceneToApi(scene, {
      id: "r",
      sceneKind: "explore",
      beats: [{ say: { speaker: "X", text: "keep-me" } }],
      exit: { type: "return" },
    });
    const beats = api.beats as Array<{ id?: string; say?: { speaker: string; text: string } }>;
    expect(beats).toHaveLength(1);
    expect(beats[0]?.say).toEqual({ speaker: "X", text: "keep-me" });
    expect(beats[0]?.id).toMatch(BEAT_ID_RE);
    expect(api.exit).toEqual({ type: "return" });
  });

  it("exploreProjectToApi does not hard-write skipTitle", () => {
    const p = blankExploreDoc().project;
    const bare = exploreProjectToApi(p);
    expect(bare.skipTitle).toBeUndefined();
    const withRaw = exploreProjectToApi(p, { skipTitle: false, font: "x.ttf" });
    expect(withRaw.skipTitle).toBe(false);
    expect(withRaw.font).toBe("x.ttf");
  });

  it("load → save preserves non-Explore host fields (font/titleBg/cg/exit)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "plane-explore-lossless-"));
    await mkdir(path.join(root, "scenario"), { recursive: true });
    const api = createFsPersistApi(root);

    const projectSeed = {
      id: "demo",
      title: "Demo",
      schemaVersion: 2,
      resolution: { width: 1920, height: 1080 },
      startScene: "study",
      locale: "zh-Hant",
      skipTitle: false,
      font: "fonts/NotoSans.ttf",
      titleBg: "ui/title.png",
      cg: ["cg/01", "cg/02"],
      titleButtons: [{ id: "start", label: "開始" }],
      verbs: [{ id: "look", label: "看", builtin: true }],
      items: [],
      switches: [],
      fallback: { perVerb: { look: "冇咩特別。" }, global: "……" },
    };
    const sceneSeed = {
      id: "study",
      title: "書房",
      sceneKind: "explore",
      beats: [{ say: { speaker: "X", text: "keep-beats" } }],
      exit: { type: "return" },
      hotspots: [
        {
          id: "desk",
          name: "書桌",
          shape: { type: "rect", x: 10, y: 20, w: 100, h: 80 },
        },
      ],
      interactions: [
        {
          hotspot: "desk",
          on: { verb: "look" },
          rules: [{ when: [], do: [{ type: "say", text: "desk" }] }],
        },
      ],
    };

    await writeFile(
      path.join(root, "galeng.json"),
      `${JSON.stringify(projectSeed, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(root, "scenario", "study.json"),
      `${JSON.stringify(sceneSeed, null, 2)}\n`,
      "utf8",
    );

    const doc = await loadExploreDoc(api, "study");
    expect(doc._rawProject?.font).toBe("fonts/NotoSans.ttf");
    expect(doc._rawScene?.exit).toEqual({ type: "return" });

    // Mutate explore-owned field then save
    let bus = emptyBus();
    let next = doc;
    ({ bus, doc: next } = dispatch(
      bus,
      next,
      addItem({ id: "key", name: "鎖匙" }),
    ));
    void bus;
    await saveExploreDoc(api, next);

    const projectOnDisk = JSON.parse(
      await readFile(path.join(root, "galeng.json"), "utf8"),
    ) as Record<string, unknown>;
    const sceneOnDisk = JSON.parse(
      await readFile(path.join(root, "scenario", "study.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(projectOnDisk.font).toBe("fonts/NotoSans.ttf");
    expect(projectOnDisk.titleBg).toBe("ui/title.png");
    expect(projectOnDisk.cg).toEqual(["cg/01", "cg/02"]);
    expect(projectOnDisk.titleButtons).toEqual([{ id: "start", label: "開始" }]);
    expect(projectOnDisk.skipTitle).toBe(false);
    expect((projectOnDisk.items as { id: string }[])[0]?.id).toBe("key");

    expect(sceneOnDisk.exit).toEqual({ type: "return" });
    const diskBeats = sceneOnDisk.beats as Array<{
      id?: string;
      say?: { speaker: string; text: string };
    }>;
    expect(diskBeats).toHaveLength(1);
    expect(diskBeats[0]?.say).toEqual({ speaker: "X", text: "keep-beats" });
    expect(diskBeats[0]?.id).toMatch(BEAT_ID_RE);
    expect(sceneOnDisk.sceneKind).toBe("explore");
  });

  it("cleared bg/onEnter/onEmptyClick/title/effectLibrary do not resurrect from raw on save", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "plane-explore-clear-"));
    await mkdir(path.join(root, "scenario"), { recursive: true });
    const api = createFsPersistApi(root);

    const projectSeed = {
      id: "demo",
      title: "Demo",
      schemaVersion: 2,
      resolution: { width: 1920, height: 1080 },
      startScene: "study",
      locale: "zh-Hant",
      verbs: [{ id: "look", label: "看", builtin: true }],
      items: [],
      switches: [],
      fallback: { perVerb: { look: "…" }, global: "…" },
      effectLibrary: [{ id: "fade_black", kind: "fade", params: { ms: 400 } }],
    };
    const sceneSeed = {
      id: "study",
      title: "書房",
      sceneKind: "explore",
      bg: { asset: "bg/study" },
      beats: [],
      hotspots: [],
      interactions: [],
      onEnter: [{ type: "say", text: "入場" }],
      onEmptyClick: [{ type: "say", text: "空白睇房" }],
    };
    await writeFile(
      path.join(root, "galeng.json"),
      `${JSON.stringify(projectSeed, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(root, "scenario", "study.json"),
      `${JSON.stringify(sceneSeed, null, 2)}\n`,
      "utf8",
    );

    let doc = await loadExploreDoc(api, "study");
    expect(doc.scene.bg?.asset).toBe("bg/study");
    expect(doc.scene.onEnter).toHaveLength(1);
    expect(doc.scene.onEmptyClick).toHaveLength(1);
    expect(doc.project.effectLibrary?.[0]?.id).toBe("fade_black");

    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, updateScene({ bg: undefined }, "clear-bg")));
    ({ bus, doc } = dispatch(bus, doc, setOnEnter([])));
    ({ bus, doc } = dispatch(bus, doc, setOnEmptyClick([])));
    void bus;
    // title / effectLibrary have no clear-via-command yet; mutate Explore-owned state directly.
    doc = {
      ...doc,
      scene: { ...doc.scene, title: undefined },
      project: { ...doc.project, effectLibrary: [] },
    };

    await saveExploreDoc(api, doc);

    const sceneOnDisk = JSON.parse(
      await readFile(path.join(root, "scenario", "study.json"), "utf8"),
    ) as Record<string, unknown>;
    const projectOnDisk = JSON.parse(
      await readFile(path.join(root, "galeng.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(sceneOnDisk.bg).toBeUndefined();
    expect(sceneOnDisk.onEnter).toBeUndefined();
    expect(sceneOnDisk.onEmptyClick).toBeUndefined();
    expect(sceneOnDisk.title).toBeUndefined();
    expect(projectOnDisk.effectLibrary).toBeUndefined();

    // Unit-level: owned omit + raw merge must delete keys
    const sceneMerged = exploreSceneToApi(
      {
        ...blankExploreDoc("study").scene,
        bg: undefined,
        onEnter: [],
        onEmptyClick: [],
        title: undefined,
      },
      {
        id: "study",
        bg: { asset: "old" },
        onEnter: [{ type: "say", text: "x" }],
        onEmptyClick: [{ type: "say", text: "y" }],
        title: "old",
        exit: { type: "return" },
      },
    );
    expect(sceneMerged.bg).toBeUndefined();
    expect(sceneMerged.onEnter).toBeUndefined();
    expect(sceneMerged.onEmptyClick).toBeUndefined();
    expect(sceneMerged.title).toBeUndefined();
    expect(sceneMerged.exit).toEqual({ type: "return" });

    const projMerged = exploreProjectToApi(
      { ...blankExploreDoc().project, effectLibrary: [] },
      { effectLibrary: [{ id: "fade_black" }], font: "keep.ttf" },
    );
    expect(projMerged.effectLibrary).toBeUndefined();
    expect(projMerged.font).toBe("keep.ttf");
  });

  it("loads onEmptyClick from click-room study.json and round-trips", async () => {
    const { fileURLToPath } = await import("node:url");
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../examples/click-room",
    );
    const api = createFsPersistApi(root);
    const doc = await loadExploreDoc(api, "study");
    expect(doc.scene.onEmptyClick).toEqual([
      { type: "say", text: "靜謐書房，舊紙同木蠟味混喺空氣裏。" },
    ]);

    const body = exploreSceneToApi(doc.scene, doc._rawScene);
    expect(body.onEmptyClick).toEqual(doc.scene.onEmptyClick);
    const back = apiToExploreScene(body);
    expect(back.onEmptyClick).toEqual(doc.scene.onEmptyClick);
  });
});

describe("loadSiblingExploreScenes L4", () => {
  it("uses in-memory current scene and loads siblings from disk", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "plane-explore-sib-"));
    const api = createFsPersistApi(root);

    let room = blankExploreDoc("room");
    let bus = emptyBus();
    ({ bus, doc: room } = dispatch(bus, room, addHotspot({ id: "desk" })));
    await saveExploreDoc(api, room);

    let attic = blankExploreDoc("attic");
    ({ bus, doc: attic } = dispatch(bus, attic, addHotspot({ id: "chest" })));
    // share project id with room on disk
    attic = { ...attic, project: room.project, _rawProject: room._rawProject };
    await saveExploreDoc(api, attic);

    // dirty in-memory: rename hotspot on room without saving
    ({ bus, doc: room } = dispatch(
      bus,
      room,
      addHotspot({ id: "lamp", name: "燈" }),
    ));
    void bus;

    const scenes = await loadSiblingExploreScenes(
      api,
      [
        { id: "room", kind: "explore" },
        { id: "attic", kind: "explore" },
      ],
      room,
    );
    expect(scenes.map((s) => s.id).sort()).toEqual(["attic", "room"]);
    const roomScene = scenes.find((s) => s.id === "room")!;
    expect(roomScene.hotspots.map((h) => h.id).sort()).toEqual(["desk", "lamp"]);
    const atticScene = scenes.find((s) => s.id === "attic")!;
    expect(atticScene.hotspots.map((h) => h.id)).toEqual(["chest"]);
  });
});
