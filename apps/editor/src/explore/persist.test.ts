import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import { addHotspot, addItem, setInteraction } from "./commands";
import { blankExploreDoc } from "./fixture";
import {
  apiToExploreScene,
  exploreProjectToApi,
  exploreSceneToApi,
  loadExploreDoc,
  saveExploreDoc,
} from "./persist";
import { createFsPersistApi } from "./persistFs";

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

  it("exploreSceneToApi includes empty beats for host compatibility", () => {
    const scene = blankExploreDoc("r").scene;
    const api = exploreSceneToApi(scene);
    expect(api.beats).toEqual([]);
    expect(api.sceneKind).toBe("explore");
    const back = apiToExploreScene(api);
    expect(back.sceneKind).toBe("explore");
    expect(back.id).toBe("r");
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
      beats: [{ say: { speaker: "X", text: "should-clear" } }],
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
    expect(sceneOnDisk.beats).toEqual([]);
    expect(sceneOnDisk.sceneKind).toBe("explore");
  });
});
