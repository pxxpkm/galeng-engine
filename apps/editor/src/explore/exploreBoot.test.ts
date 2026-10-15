import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bootExplore, exploreBootSceneId } from "./exploreBoot";
import type { ExplorePersistApi } from "./persist";
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
    if (!result.ok) return;
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
    if (!result.ok) return;
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
});
