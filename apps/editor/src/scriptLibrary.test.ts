import { describe, expect, it } from "vitest";
import {
  filterScriptRows,
  inferSceneKind,
  scriptRowFromScene,
  type ScriptRow,
} from "./scriptLibrary";
import type { Scene } from "./types";

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
});
