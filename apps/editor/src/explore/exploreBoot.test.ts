import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { exploreDocForNewRoom } from "../sceneOpen";
import { bootExplore, exploreBootSceneId } from "./exploreBoot";
import { saveExploreDoc, type ExplorePersistApi } from "./persist";
import { createFsPersistApi } from "./persistFs";

const hallScene = {
  id: "hall",
  title: "大廳",
  sceneKind: "explore",
  hotspots: [],
  interactions: [],
};

const studyScene = {
  id: "study",
  title: "書房",
  sceneKind: "explore",
  hotspots: [],
  interactions: [],
};

function project(startScene?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    id: "demo",
    title: "Demo",
    schemaVersion: 2,
    resolution: { width: 1920, height: 1080 },
  };
  if (startScene !== undefined) body.startScene = startScene;
  return body;
}

describe("exploreBootSceneId", () => {
  it("reads a non-empty startScene", () => {
    expect(exploreBootSceneId({ startScene: "hall" })).toBe("hall");
    expect(exploreBootSceneId({ startScene: "  park_01  " })).toBe("park_01");
  });

  it("falls back to study only when missing or blank", () => {
    expect(exploreBootSceneId({})).toBe("study");
    expect(exploreBootSceneId({ startScene: "" })).toBe("study");
    expect(exploreBootSceneId({ startScene: "   " })).toBe("study");
    expect(exploreBootSceneId({ startScene: null })).toBe("study");
    expect(exploreBootSceneId(null)).toBe("study");
    expect(exploreBootSceneId([])).toBe("study");
  });
});

describe("bootExplore", () => {
  it("loads project.startScene and does not write", async () => {
    const saves: string[] = [];
    const sceneLoads: string[] = [];
    const api: ExplorePersistApi = {
      loadProject: async () => project("hall"),
      saveProject: async (body) => {
        saves.push("project");
        return body;
      },
      loadScene: async (id) => {
        sceneLoads.push(id);
        if (id !== "hall") throw new Error(`missing ${id}`);
        return hallScene;
      },
      saveScene: async (_id, body) => {
        saves.push("scene");
        return body;
      },
      listSceneIds: async () => [],
    };

    const result = await bootExplore(api);
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(sceneLoads).toEqual(["hall"]);
    expect(result.doc.scene.id).toBe("hall");
    expect(result.doc.project.startScene).toBe("hall");
    expect(result.sceneCatalog.map((e) => e.id)).toContain("hall");
    expect(saves).toEqual([]);
  });

  it("uses study when startScene is missing, and keeps it in the catalog", async () => {
    const api: ExplorePersistApi = {
      loadProject: async () => project(),
      saveProject: async (body) => body,
      loadScene: async (id) => {
        if (id !== "study") throw new Error(`unexpected scene ${id}`);
        return studyScene;
      },
      saveScene: async (_id, body) => body,
      listSceneIds: async () => [],
    };

    const result = await bootExplore(api);
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.doc.scene.id).toBe("study");
    const ids = result.sceneCatalog.map((e) => e.id);
    expect(ids).toContain("study");
    // api project without startScene normalizes to "room"; catalog still lists it.
    expect(ids).toContain("room");
  });

  it("returns an error when persist rejects and does not save", async () => {
    let saves = 0;
    const api: ExplorePersistApi = {
      loadProject: async () => {
        throw new Error("host down");
      },
      saveProject: async (body) => {
        saves += 1;
        return body;
      },
      loadScene: async () => {
        throw new Error("should not load scene");
      },
      saveScene: async (_id, body) => {
        saves += 1;
        return body;
      },
    };

    const result = await bootExplore(api);
    expect(result).toEqual({ ok: false, error: "host down" });
    expect(saves).toBe(0);
  });

  it("does not overwrite galeng.json when the start scene is missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "plane-explore-boot-"));
    const raw = `${JSON.stringify(project("missing-room"), null, 2)}\n`;
    await writeFile(path.join(root, "galeng.json"), raw, "utf8");
    await mkdir(path.join(root, "scenario"), { recursive: true });

    const result = await bootExplore(createFsPersistApi(root));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
    expect(await readFile(path.join(root, "galeng.json"), "utf8")).toBe(raw);
  });

  it("opens the first catalog explore room when startScene is dialogue", async () => {
    const saves: string[] = [];
    const scenes: Record<string, unknown> = {
      park_01: { id: "park_01", title: "公園", beats: [], exit: { type: "end" } },
      // Listed before room_a so catalog order, not alphabetical order, wins.
      room_b: {
        id: "room_b",
        title: "後房",
        sceneKind: "explore",
        hotspots: [],
        interactions: [],
      },
      room_a: {
        id: "room_a",
        title: "前房",
        sceneKind: "explore",
        hotspots: [],
        interactions: [],
      },
    };
    const api: ExplorePersistApi = {
      loadProject: async () => project("park_01"),
      saveProject: async (body) => {
        saves.push("project");
        return body;
      },
      loadScene: async (id) => {
        const scene = scenes[id];
        if (!scene) throw new Error(`missing ${id}`);
        return scene;
      },
      saveScene: async (_id, body) => {
        saves.push("scene");
        return body;
      },
      listSceneIds: async () => ["room_b", "park_01", "room_a"],
    };

    const result = await bootExplore(api);
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.doc.scene.id).toBe("room_b");
    expect(result.doc.project.startScene).toBe("park_01");
    expect(result.sceneCatalog.find((entry) => entry.id === "park_01")?.kind).toBe("dialogue");
    expect(saves).toEqual([]);
  });

  it("returns empty instead of an error when the project has no explore room", async () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../examples/prologue",
    );
    const galengPath = path.join(root, "galeng.json");
    const before = await readFile(galengPath, "utf8");

    const result = await bootExplore(createFsPersistApi(root));
    expect(result.ok).toBe("empty");
    if (result.ok !== "empty") return;
    expect(result.sceneCatalog.map((entry) => entry.id)).toEqual([
      "home_01",
      "park_01",
      "park_02",
    ]);
    expect(result.sceneCatalog.every((entry) => entry.kind === "dialogue")).toBe(true);
    expect((result.projectRaw as { startScene?: string }).startScene).toBe("park_01");
    expect(await readFile(galengPath, "utf8")).toBe(before);
  });

  it("redirects a dialogue deep link and does not open an explore room", async () => {
    const examples = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../examples",
    );
    const prologue = createFsPersistApi(path.join(examples, "prologue"));
    const prologueGaleng = await readFile(path.join(examples, "prologue", "galeng.json"), "utf8");
    const fromStart = await bootExplore(prologue, { sceneId: "park_01" });
    expect(fromStart).toEqual({ ok: "dialogue", sceneId: "park_01" });
    const fromOther = await bootExplore(prologue, { sceneId: "home_01" });
    expect(fromOther).toEqual({ ok: "dialogue", sceneId: "home_01" });
    expect(await readFile(path.join(examples, "prologue", "galeng.json"), "utf8")).toBe(
      prologueGaleng,
    );

    const clickRoot = path.join(examples, "click-room");
    const clickGaleng = await readFile(path.join(clickRoot, "galeng.json"), "utf8");
    const click = await bootExplore(createFsPersistApi(clickRoot), { sceneId: "dlg_butler" });
    expect(click).toEqual({ ok: "dialogue", sceneId: "dlg_butler" });
    expect(await readFile(path.join(clickRoot, "galeng.json"), "utf8")).toBe(clickGaleng);
  });

  it("still opens click-room on startScene and keeps an explore deep link", async () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../examples/click-room",
    );
    const galengPath = path.join(root, "galeng.json");
    const studyPath = path.join(root, "scenario", "study.json");
    const beforeGaleng = await readFile(galengPath, "utf8");
    const beforeStudy = await readFile(studyPath, "utf8");
    const api = createFsPersistApi(root);

    const opened = await bootExplore(api);
    expect(opened.ok).toBe(true);
    if (opened.ok !== true) return;
    // ending sorts before study; startScene must still win.
    expect(opened.doc.scene.id).toBe("study");
    expect(opened.doc.project.startScene).toBe("study");
    expect(opened.sceneCatalog.find((entry) => entry.id === "dlg_butler")?.kind).toBe("dialogue");

    const linked = await bootExplore(api, { sceneId: "ending" });
    expect(linked.ok).toBe(true);
    if (linked.ok !== true) return;
    expect(linked.doc.scene.id).toBe("ending");
    expect(linked.doc.project.startScene).toBe("study");

    expect(await readFile(galengPath, "utf8")).toBe(beforeGaleng);
    expect(await readFile(studyPath, "utf8")).toBe(beforeStudy);
  });

  it("saves a new explore room without changing startScene, then boots into it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "plane-explore-empty-"));
    const rawProject = project("park_01");
    await writeFile(path.join(root, "galeng.json"), `${JSON.stringify(rawProject, null, 2)}\n`, "utf8");
    await mkdir(path.join(root, "scenario"), { recursive: true });
    await writeFile(
      path.join(root, "scenario", "park_01.json"),
      `${JSON.stringify({ id: "park_01", title: "公園", beats: [], exit: { type: "end" } }, null, 2)}\n`,
      "utf8",
    );
    const api = createFsPersistApi(root);

    const first = await bootExplore(api);
    expect(first.ok).toBe("empty");
    if (first.ok !== "empty") return;

    const draft = exploreDocForNewRoom(first.projectRaw, "room", "新房");
    const saved = await saveExploreDoc(api, draft);
    expect(saved.project.startScene).toBe("park_01");
    expect(saved.scene.id).toBe("room");
    expect(saved.scene.sceneKind).toBe("explore");
    const written = JSON.parse(await readFile(path.join(root, "galeng.json"), "utf8")) as {
      startScene?: string;
    };
    expect(written.startScene).toBe("park_01");

    const second = await bootExplore(api);
    expect(second.ok).toBe(true);
    if (second.ok !== true) return;
    expect(second.doc.scene.id).toBe("room");
    expect(second.doc.project.startScene).toBe("park_01");
  });
});
