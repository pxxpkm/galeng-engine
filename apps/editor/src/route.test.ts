import { describe, expect, it } from "vitest";
import {
  buildRouteTree,
  exitEdges,
  exitHint,
  formatIfKeys,
  formatSetNote,
  layoutRouteTree,
  overlayCurrent,
  ROUTE_GAP_Y,
  ROUTE_NODE_H,
  ROUTE_NODE_W,
  upsertSceneMeta,
} from "./route";
import type { Scene, SceneMeta } from "./types";

const park01: SceneMeta = {
  id: "park_01",
  title: "公園・午後",
  exit: {
    type: "choices",
    options: [
      { text: "一起走吧", goto: "park_02", set: { sora_affection: "+1" } },
      { text: "該回去了", goto: "home_01", if: { seen: true } },
    ],
  },
};

const park02: SceneMeta = { id: "park_02", title: "小路" };
const home01: SceneMeta = { id: "home_01", title: "結局" };
const extra: SceneMeta = { id: "kk" };

describe("exitEdges", () => {
  it("has no edges when the scene is an ending", () => {
    expect(exitEdges(undefined)).toEqual([]);
  });

  it("keeps a choice with if as a visible edge and notes set / if", () => {
    const edges = exitEdges(park01.exit);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({
      kind: "choice",
      to: "park_02",
      label: "一起走吧",
      hasIf: false,
      setNote: "sora_affection +1",
    });
    expect(edges[1]).toMatchObject({
      kind: "choice",
      to: "home_01",
      label: "該回去了",
      hasIf: true,
      ifNote: "seen",
    });
    expect(edges[1]?.setNote).toBeUndefined();
  });

  it("splits a branch into then and else and writes the if key on then", () => {
    expect(
      exitEdges({ type: "branch", if: { flag: { gte: 1 } }, then: "good", else: "bad" }),
    ).toEqual([
      { kind: "branchThen", to: "good", label: "", hasIf: true, ifNote: "flag" },
      { kind: "branchElse", to: "bad", label: "", hasIf: false },
    ]);
  });
});

describe("formatSetNote / formatIfKeys", () => {
  it("formats affection as key plus value", () => {
    expect(formatSetNote({ sora_affection: "+1" })).toBe("sora_affection +1");
    expect(formatSetNote(undefined)).toBe("");
  });

  it("lists if keys without evaluating", () => {
    expect(formatIfKeys({ seen: true })).toBe("seen");
    expect(formatIfKeys({ a: 1, b: 2 })).toBe("a · b");
    expect(formatIfKeys(null)).toBe("");
  });
});

describe("exitHint", () => {
  it("marks an ending", () => {
    expect(exitHint(undefined, new Set(["a"]))).toEqual({
      ending: true,
      targets: [],
      missing: false,
    });
  });

  it("flags a dangling next", () => {
    const hint = exitHint({ type: "next", goto: "ghost" }, new Set(["park_01"]));
    expect(hint.ending).toBe(false);
    expect(hint.targets).toEqual(["ghost"]);
    expect(hint.missing).toBe(true);
  });

  it("flags an empty goto", () => {
    expect(exitHint({ type: "next", goto: "" }, new Set(["park_01"])).missing).toBe(true);
  });
});

describe("buildRouteTree", () => {
  it("expands prologue-style choices and lists orphans", () => {
    const view = buildRouteTree("park_01", [park01, park02, home01, extra]);
    expect(view.startMissing).toBe(false);
    expect(view.root?.id).toBe("park_01");
    expect(view.root?.kind).toBe("scene");
    expect(view.root?.children.map((child) => [child.edge.to, child.node.kind, child.dangling])).toEqual([
      ["park_02", "ending", false],
      ["home_01", "ending", false],
    ]);
    expect(view.orphans.map((scene) => scene.id)).toEqual(["kk"]);
  });

  it("stops a cycle with a revisit leaf", () => {
    const a: SceneMeta = { id: "a", exit: { type: "next", goto: "b" } };
    const b: SceneMeta = { id: "b", exit: { type: "next", goto: "a" } };
    const view = buildRouteTree("a", [a, b]);
    const leaf = view.root?.children[0]?.node;
    expect(leaf?.id).toBe("b");
    expect(leaf?.kind).toBe("scene");
    expect(leaf?.children[0]?.node).toMatchObject({ id: "a", kind: "revisit", children: [] });
    expect(view.orphans).toEqual([]);
  });

  it("marks a missing start and treats every scene as orphan", () => {
    const view = buildRouteTree("ghost", [park01]);
    expect(view.startMissing).toBe(true);
    expect(view.root).toMatchObject({ id: "ghost", kind: "missing" });
    expect(view.orphans.map((scene) => scene.id)).toEqual(["park_01"]);
  });

  it("marks an empty start as missing without a root", () => {
    const view = buildRouteTree("", [park01]);
    expect(view.startMissing).toBe(true);
    expect(view.root).toBeNull();
    expect(view.orphans).toEqual([park01]);
  });

  it("marks an empty or unknown goto as a missing leaf", () => {
    const scene: SceneMeta = {
      id: "hub",
      exit: {
        type: "choices",
        options: [
          { text: "empty", goto: "" },
          { text: "gone", goto: "nope" },
        ],
      },
    };
    const view = buildRouteTree("hub", [scene]);
    expect(view.root?.children.map((child) => [child.dangling, child.node.kind, child.node.id])).toEqual([
      [true, "missing", ""],
      [true, "missing", "nope"],
    ]);
  });
});

describe("layoutRouteTree", () => {
  it("places a two-choice fork without overlapping children", () => {
    const view = buildRouteTree("park_01", [park01, park02, home01]);
    const diagram = layoutRouteTree(view.root);
    expect(diagram.boxes.map((box) => [box.id, box.kind])).toEqual([
      ["park_01", "scene"],
      ["park_02", "ending"],
      ["home_01", "ending"],
    ]);
    expect(diagram.links).toHaveLength(2);
    expect(diagram.links[0]?.edge.label).toBe("一起走吧");
    const parent = diagram.boxes[0]!;
    const left = diagram.boxes[1]!;
    const right = diagram.boxes[2]!;
    expect(parent.y).toBe(0);
    expect(left.y).toBe(ROUTE_NODE_H + ROUTE_GAP_Y);
    expect(right.y).toBe(left.y);
    expect(left.x + left.w).toBeLessThanOrEqual(right.x);
    expect(parent.x + parent.w / 2).toBeCloseTo((left.x + right.x + ROUTE_NODE_W) / 2);
  });

  it("returns an empty diagram without a root", () => {
    expect(layoutRouteTree(null)).toEqual({ width: 0, height: 0, boxes: [], links: [] });
  });

  it("keeps a revisit as a leaf box", () => {
    const a: SceneMeta = { id: "a", exit: { type: "next", goto: "b" } };
    const b: SceneMeta = { id: "b", exit: { type: "next", goto: "a" } };
    const diagram = layoutRouteTree(buildRouteTree("a", [a, b]).root);
    expect(diagram.boxes.map((box) => [box.id, box.kind])).toEqual([
      ["a", "scene"],
      ["b", "scene"],
      ["a", "revisit"],
    ]);
  });
});

describe("overlayCurrent / upsertSceneMeta", () => {
  it("uses the in-memory exit before save", () => {
    const current: Scene = {
      id: "park_01",
      title: "公園・午後",
      beats: [],
      exit: { type: "next", goto: "park_02" },
    };
    const overlaid = overlayCurrent([park01, park02], current);
    expect(exitEdges(overlaid[0].exit)).toEqual([
      { kind: "next", to: "park_02", label: "", hasIf: false },
    ]);
    const view = buildRouteTree("park_01", overlaid);
    expect(view.root?.children).toHaveLength(1);
    expect(view.root?.children[0]?.edge.kind).toBe("next");
  });

  it("inserts or replaces a list row", () => {
    const created: Scene = { id: "new_01", beats: [] };
    expect(upsertSceneMeta([park02], created).map((s) => s.id)).toEqual(["new_01", "park_02"]);
    const saved: Scene = { id: "park_02", title: "小路", beats: [], exit: { type: "next", goto: "home_01" } };
    expect(upsertSceneMeta([park02], saved)[0].exit).toEqual({ type: "next", goto: "home_01" });
  });

  it("keeps inferred scene kind on the list row", () => {
    const explore: Scene = { id: "study", title: "書房", beats: [], hotspots: [{ id: "desk" }] };
    expect(upsertSceneMeta([], explore)[0]?.sceneKind).toBe("explore");
    const explicit: Scene = {
      id: "talk",
      beats: [],
      sceneKind: "dialogue",
      hotspots: [{ id: "desk" }],
    };
    expect(upsertSceneMeta([], explicit)[0]?.sceneKind).toBe("dialogue");
    const overlaid = overlayCurrent([{ id: "study", title: "old", sceneKind: "dialogue" }], explore);
    expect(overlaid[0]?.sceneKind).toBe("explore");
    expect(overlaid[0]?.title).toBe("書房");
  });
});
