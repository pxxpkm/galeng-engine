import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadExploreDoc } from "./persist";
import { createFsPersistApi } from "./persistFs";
import { collectExploreProblems } from "./problems";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../examples/click-room",
);

describe("examples/click-room", () => {
  it("loads via editor persist and has no error-level problems", async () => {
    const api = createFsPersistApi(root);
    const doc = await loadExploreDoc(api, "study");
    expect(doc.project.id).toBe("click-room");
    expect(doc.project.items.map((i) => i.id)).toEqual(["key"]);
    expect(doc.project.switches.map((s) => s.id).sort()).toEqual([
      "door_open",
      "drawer_open",
    ]);
    expect(doc.scene.hotspots).toHaveLength(4);
    expect(doc.scene.interactions.some((i) => i.on && "verb" in i.on && i.on.verb === "talk")).toBe(
      true,
    );
    const known = new Set(["study", "dlg_butler", "ending"]);
    const errors = collectExploreProblems(doc, known).filter((p) => p.severity === "error");
    expect(errors).toEqual([]);
  });

  it("door×key uses explicit takeItem only (no consumeOnUse dual / dead door_open rule)", async () => {
    const api = createFsPersistApi(root);
    const doc = await loadExploreDoc(api, "study");
    const key = doc.project.items.find((i) => i.id === "key");
    expect(key?.consumeOnUse).toBeFalsy();

    const doorKey = doc.scene.interactions.find(
      (i) => i.hotspot === "door" && i.on && "item" in i.on && i.on.item === "key",
    );
    expect(doorKey).toBeDefined();
    const rules = doorKey!.rules;
    expect(rules).toHaveLength(1);
    expect(rules[0]!.when).toEqual([]);
    expect(rules[0]!.do.some((a) => a.type === "takeItem" && a.id === "key")).toBe(true);
    expect(rules[0]!.do.some((a) => a.type === "setSwitch" && a.id === "door_open")).toBe(true);

    // "門已開" is via look/move verbs, not a dead item:key + door_open rule
    const dead = rules.some((r) =>
      r.when.some((w) => "switch" in w && w.switch === "door_open" && w.is === true),
    );
    expect(dead).toBe(false);
    expect(
      doc.scene.interactions.some(
        (i) =>
          i.hotspot === "door" &&
          i.on &&
          "verb" in i.on &&
          i.on.verb === "look" &&
          i.rules.some((r) =>
            r.when.some((w) => "switch" in w && w.switch === "door_open" && w.is === true),
          ),
      ),
    ).toBe(true);
  });
});
