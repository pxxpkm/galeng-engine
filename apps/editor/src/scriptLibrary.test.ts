import { describe, expect, it } from "vitest";
import {
  filterScriptRows,
  inferSceneKind,
  loadScriptRows,
  readableScenesForExport,
  reloadScriptRow,
  scriptRowFromLoadFailure,
  scriptRowFromMeta,
  scriptRowFromScene,
  type ScriptRow,
} from "./scriptLibrary";
import type { Scene, SceneMeta } from "./types";

describe("scriptLibrary", () => {
  const ids = new Set(["a", "b", "dlg"]);

  it("infers explore from hotspots", () => {
    expect(inferSceneKind({ id: "x", beats: [], hotspots: [{ id: "h" }] })).toBe("explore");
    expect(inferSceneKind({ id: "x", beats: [], sceneKind: "dialogue" })).toBe("dialogue");
  });

  it("flags unresolved goto", () => {
    const scene: Scene = {
      id: "a",
      beats: [{ say: { speaker: "管家", text: "你好" } }],
      exit: { type: "next", goto: "missing" },
    };
    const row = scriptRowFromScene(scene, { allIds: ids });
    expect(row.unresolvedGoto).toBe(true);
    expect(row.speakers).toEqual(["管家"]);
    expect(row.beatCount).toBe(1);
  });

  it("filters by kind and speaker", () => {
    const rows: ScriptRow[] = [
      scriptRowFromScene(
        { id: "dlg", beats: [{ say: { speaker: "管家", text: "x" } }], exit: { type: "return" } },
        { allIds: ids },
      ),
      scriptRowFromScene(
        {
          id: "room",
          sceneKind: "explore",
          beats: [],
          hotspots: [],
        },
        { allIds: ids },
      ),
    ];
    expect(filterScriptRows(rows, { kind: "dialogue", query: "", speaker: "管家", callReturn: "", unresolvedOnly: false }).map((r) => r.id)).toEqual([
      "dlg",
    ]);
    expect(filterScriptRows(rows, { kind: "explore", query: "", speaker: "", callReturn: "", unresolvedOnly: false }).map((r) => r.id)).toEqual([
      "room",
    ]);
  });

  it("keeps a failed GET off the empty-manuscript path and leaves other scenes", async () => {
    const live: SceneMeta[] = [
      { id: "bad", title: "Broken" },
      { id: "ok", title: "Fine" },
    ];
    const archived: SceneMeta[] = [{ id: "old", title: "Old", exit: { type: "end" } }];
    let gets = 0;
    const rows = await loadScriptRows(live, archived, null, async (id) => {
      gets += 1;
      if (id === "bad") throw new Error("GET /api/scenes/bad failed");
      return { id, title: "Fine", beats: [{ say: { speaker: "管家", text: "在" } }] };
    });

    expect(gets).toBe(2);
    const bad = rows.find((r) => r.id === "bad");
    expect(bad?.loadError).toMatch(/bad/);
    expect(bad?.scene).toBeUndefined();
    expect(bad?.beatCount).not.toBe(0);
    expect(bad?.fileName).toBe("scenario/bad.json");

    const ok = rows.find((r) => r.id === "ok");
    expect(ok?.loadError).toBeUndefined();
    expect(ok?.beatCount).toBe(1);
    expect(ok?.scene?.beats).toHaveLength(1);

    const old = rows.find((r) => r.id === "old");
    expect(old?.archived).toBe(true);
    expect(old?.loadError).toBeUndefined();
    expect(old?.scene).toBeUndefined();

    const exported = readableScenesForExport(rows);
    expect(exported.ok).toBe(false);
    if (!exported.ok) {
      expect(exported.missing).toEqual([{ id: "bad", fileName: "scenario/bad.json" }]);
    }

    const visible = filterScriptRows(rows, {
      kind: "explore",
      query: "nomatch",
      speaker: "nobody",
      callReturn: "call",
      unresolvedOnly: true,
    });
    expect(visible.map((r) => r.id)).toEqual(["bad"]);
  });

  it("retries a failed row with another GET and does not invent beats", async () => {
    const failed = scriptRowFromLoadFailure({ id: "bad", title: "Broken" }, "nope");
    expect(failed.scene).toBeUndefined();
    expect(failed.beatCount).toBe(-1);

    let calls = 0;
    const still = await reloadScriptRow(failed, new Set(["bad"]), async () => {
      calls += 1;
      throw new Error("still down");
    });
    expect(calls).toBe(1);
    expect(still.loadError).toBe("still down");
    expect(still.scene).toBeUndefined();

    const fixed = await reloadScriptRow(failed, new Set(["bad"]), async () => {
      calls += 1;
      return { id: "bad", beats: [{ say: { speaker: "a", text: "hi" } }] };
    });
    expect(calls).toBe(2);
    expect(fixed.loadError).toBeUndefined();
    expect(fixed.beatCount).toBe(1);
    expect(fixed.scene?.beats[0]?.say?.text).toBe("hi");
  });

  it("exports a real empty scene and refuses a load failure that looks empty", () => {
    const empty = scriptRowFromScene(
      { id: "blank", beats: [] },
      { allIds: new Set(["blank"]) },
    );
    expect(empty.beatCount).toBe(0);
    expect(empty.loadError).toBeUndefined();
    expect(readableScenesForExport([empty])).toEqual({ ok: true, scenes: [empty.scene] });

    const archived = scriptRowFromMeta(
      { id: "old", title: "Old" },
      { archived: true, allIds: new Set(["old"]) },
    );
    expect(archived.loadError).toBeUndefined();
    expect(readableScenesForExport([empty, archived]).ok).toBe(true);

    const failed = scriptRowFromLoadFailure({ id: "bad" }, "io");
    const blocked = readableScenesForExport([empty, failed, archived]);
    expect(blocked).toEqual({
      ok: false,
      missing: [{ id: "bad", fileName: "scenario/bad.json" }],
    });
  });
});
