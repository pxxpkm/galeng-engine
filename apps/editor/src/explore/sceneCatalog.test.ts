import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFsPersistApi } from "./persistFs";
import {
  buildSceneCatalog,
  loadSceneCatalog,
  sceneRawToCatalogEntry,
} from "./sceneCatalog";

describe("sceneCatalog", () => {
  it("marks dialogue with return exit", () => {
    const e = sceneRawToCatalogEntry({
      id: "dlg_butler",
      sceneKind: "dialogue",
      exit: { type: "return" },
    });
    expect(e).toEqual({
      id: "dlg_butler",
      kind: "dialogue",
      title: undefined,
      hasReturn: true,
    });
  });

  it("marks dialogue without return as hasReturn false", () => {
    const e = sceneRawToCatalogEntry({
      id: "ending",
      sceneKind: "dialogue",
      exit: { type: "next", goto: "x" },
    });
    expect(e?.hasReturn).toBe(false);
  });

  it("infers explore from hotspots", () => {
    const e = sceneRawToCatalogEntry({
      id: "study",
      hotspots: [{ id: "a" }],
    });
    expect(e?.kind).toBe("explore");
    expect(e?.hasReturn).toBeUndefined();
  });

  it("loadSceneCatalog from FS lists click-room scenes", async () => {
    // apps/editor cwd when vitest runs from apps/editor
    const root = path.resolve(process.cwd(), "../../examples/click-room");
    const api = createFsPersistApi(root);
    const catalog = await loadSceneCatalog(api);
    const ids = catalog.map((c) => c.id).sort();
    expect(ids).toEqual(["dlg_butler", "ending", "study"].sort());
    const butler = catalog.find((c) => c.id === "dlg_butler")!;
    expect(butler.kind).toBe("dialogue");
    expect(butler.hasReturn).toBe(true);
    const study = catalog.find((c) => c.id === "study")!;
    expect(study.kind).toBe("explore");
  });

  it("buildSceneCatalog dedupes", () => {
    const cat = buildSceneCatalog([
      { id: "a", sceneKind: "explore" },
      { id: "a", sceneKind: "explore" },
    ]);
    expect(cat).toHaveLength(1);
  });

  it("FS listSceneIds reads scenario dir", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "plane-cat-"));
    await mkdir(path.join(root, "scenario"), { recursive: true });
    await writeFile(
      path.join(root, "scenario", "dlg_x.json"),
      JSON.stringify({
        id: "dlg_x",
        sceneKind: "dialogue",
        beats: [],
        exit: { type: "return" },
      }),
    );
    await writeFile(
      path.join(root, "galeng.json"),
      JSON.stringify({
        id: "t",
        title: "t",
        schemaVersion: 2,
        resolution: { width: 1920, height: 1080 },
        startScene: "dlg_x",
        locale: "zh-Hant",
      }),
    );
    const api = createFsPersistApi(root);
    expect(await api.listSceneIds!()).toEqual(["dlg_x"]);
    const cat = await loadSceneCatalog(api);
    expect(cat[0]?.hasReturn).toBe(true);
  });

  it("cross-scene Next chain: dlg_a -> dlg_b(return) ⇒ hasReturn true", () => {
    const cat = buildSceneCatalog([
      {
        id: "dlg_a",
        sceneKind: "dialogue",
        beats: [],
        exit: { type: "next", goto: "dlg_b" },
      },
      {
        id: "dlg_b",
        sceneKind: "dialogue",
        beats: [],
        exit: { type: "return" },
      },
    ]);
    expect(cat.find((c) => c.id === "dlg_a")?.hasReturn).toBe(true);
    expect(cat.find((c) => c.id === "dlg_b")?.hasReturn).toBe(true);
  });

  it("Choices / Branch reachability marks hasReturn", () => {
    const cat = buildSceneCatalog([
      {
        id: "dlg_choice",
        sceneKind: "dialogue",
        exit: {
          type: "choices",
          options: [
            { text: "go", goto: "dlg_ret" },
            { text: "end", goto: "dlg_dead" },
          ],
        },
      },
      {
        id: "dlg_branch",
        sceneKind: "dialogue",
        exit: {
          type: "branch",
          if: { flag: "x" },
          then: "dlg_ret",
          else: "dlg_dead",
        },
      },
      { id: "dlg_ret", sceneKind: "dialogue", exit: { type: "return" } },
      { id: "dlg_dead", sceneKind: "dialogue", exit: { type: "next", goto: "missing" } },
    ]);
    expect(cat.find((c) => c.id === "dlg_choice")?.hasReturn).toBe(true);
    expect(cat.find((c) => c.id === "dlg_branch")?.hasReturn).toBe(true);
    expect(cat.find((c) => c.id === "dlg_dead")?.hasReturn).toBe(false);
  });

  it("does not follow Call exits for hasReturn", () => {
    const cat = buildSceneCatalog([
      {
        id: "dlg_caller",
        sceneKind: "dialogue",
        exit: { type: "call", scene: "dlg_ret" },
      },
      { id: "dlg_ret", sceneKind: "dialogue", exit: { type: "return" } },
    ]);
    expect(cat.find((c) => c.id === "dlg_caller")?.hasReturn).toBe(false);
  });

});
