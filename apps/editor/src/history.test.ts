import { describe, expect, it } from "vitest";
import { emptyHistory, push, redo, undo } from "./history";
import type { Scene } from "./types";

const scene = (text: string): Scene => ({
  id: "s",
  beats: [{ say: { speaker: "a", text } }],
});

describe("history", () => {
  it("undoes to the previous scene snapshot", () => {
    let h = emptyHistory();
    const a = { scene: scene("one"), beatIndex: 0 };
    h = push(h, a);
    const b = { scene: scene("two"), beatIndex: 1 };
    const undone = undo(h, b);
    expect(undone?.snap.scene.beats[0]?.say?.text).toBe("one");
    expect(undone?.snap.beatIndex).toBe(0);
    const redone = redo(undone!.history, undone!.snap);
    expect(redone?.snap.scene.beats[0]?.say?.text).toBe("two");
    expect(redone?.snap.beatIndex).toBe(1);
  });

  it("push clears redo", () => {
    let h = push(emptyHistory(), { scene: scene("a"), beatIndex: 0 });
    const u = undo(h, { scene: scene("b"), beatIndex: 0 });
    h = push(u!.history, u!.snap);
    expect(redo(h, u!.snap)).toBeNull();
  });

  it("starts empty", () => {
    expect(undo(emptyHistory(), { scene: scene("x"), beatIndex: 0 })).toBeNull();
  });
});
