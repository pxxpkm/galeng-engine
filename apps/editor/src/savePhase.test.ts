import { describe, expect, it } from "vitest";
import { sceneLeaveBlocked } from "./dirty";
import { targetForSaveIssue } from "./liveIssues";
import {
  anyDirtyBlocksLeave,
  describeBlockedSave,
  exploreBlockedStatus,
  exploreLayerLabel,
  nextLayerDirty,
  presentLayer,
  saveBodyFromLatest,
} from "./savePhase";

describe("U03 save phase", () => {
  it("does not show saved while a slow PUT is in flight and the author keeps typing", () => {
    let rev = 1;
    const started = rev;
    let dirty = true;
    expect(
      presentLayer({ dirty, inflight: true, editedSinceStart: false, outcome: "none" }),
    ).toBe("saving");

    rev += 1;
    dirty = true;
    expect(
      presentLayer({
        dirty,
        inflight: true,
        editedSinceStart: rev !== started,
        outcome: "none",
      }),
    ).toBe("dirty");

    const clearDirty = rev === started;
    expect(clearDirty).toBe(false);
    expect(
      presentLayer({
        dirty: true,
        inflight: false,
        editedSinceStart: false,
        outcome: clearDirty ? "saved" : "none",
      }),
    ).not.toBe("saved");
    expect(
      presentLayer({ dirty: true, inflight: false, editedSinceStart: false, outcome: "saved" }),
    ).toBe("dirty");
    expect(
      presentLayer({ dirty: false, inflight: false, editedSinceStart: false, outcome: "saved" }),
    ).toBe("saved");
  });

  it("keeps the draft dirty after a failed PUT and retries the latest body", () => {
    let draft = { title: "old" };
    const failedBody = saveBodyFromLatest(draft);
    expect(
      presentLayer({ dirty: true, inflight: false, editedSinceStart: false, outcome: "failed" }),
    ).toBe("failed");
    draft = { title: "new" };
    expect(failedBody).toEqual({ title: "old" });
    expect(saveBodyFromLatest(draft)).toEqual({ title: "new" });
    expect(anyDirtyBlocksLeave(true, false)).toBe(true);
  });

  it("marks only the layer that changed", () => {
    const base = { project: { title: "a" }, scene: { id: "room" } };
    expect(
      nextLayerDirty({ project: false, scene: false }, base, {
        project: { title: "b" },
        scene: { id: "room" },
      }),
    ).toEqual({ project: true, scene: false, any: true });
    expect(
      nextLayerDirty({ project: false, scene: false }, base, {
        project: { title: "a" },
        scene: { id: "hall" },
      }),
    ).toEqual({ project: false, scene: true, any: true });
  });

  it("still blocks leave when either layer is dirty", () => {
    expect(anyDirtyBlocksLeave(true, false)).toBe(sceneLeaveBlocked(true, false));
    expect(anyDirtyBlocksLeave(false, true)).toBe(true);
    expect(anyDirtyBlocksLeave(false, false)).toBe(false);
    expect(
      presentLayer({ dirty: true, inflight: true, editedSinceStart: false, outcome: "none" }),
    ).not.toBe("clean");
  });

  it("includes the field name and focuses only when a locator exists", () => {
    const t = (key: string) =>
      key === "editor.saveBlocked" ? "blocked" : key === "editor.emptySaySpeaker" ? "speaker {n}" : key;
    const issues = [{ key: "editor.emptySaySpeaker", params: { n: 2 } }];
    const located = describeBlockedSave(issues, t, (issue) => targetForSaveIssue("room", issue));
    expect(located.message).toContain("speaker");
    expect(located.focus).toEqual({ kind: "beat", sceneId: "room", beatIndex: 2 });
    const textOnly = describeBlockedSave(issues, t, () => null);
    expect(textOnly.focus).toBeNull();
    expect(textOnly.message).toContain("speaker");
    expect(targetForSaveIssue(null, { key: "editor.emptySayText", params: { n: 0 } })).toBeNull();
  });

  it("does not call an explore load synced before a save returns", () => {
    expect(exploreLayerLabel("clean", "場景")).toBe("");
    expect(exploreLayerLabel("saving", "場景")).toBe("場景儲存中");
    expect(exploreLayerLabel("saved", "專案")).toBe("專案已儲存");
    expect(exploreLayerLabel("dirty", "場景")).not.toContain("已同步");
    expect(exploreLayerLabel("saving", "場景")).not.toContain("已同步");
    const blocked = exploreBlockedStatus({
      message: "熱區沒有名字",
      context: "熱區 door",
      navKind: "hotspot",
    });
    expect(blocked.status).toContain("door");
    expect(blocked.canFocus).toBe(true);
    expect(exploreBlockedStatus({ message: "缺開始場景", context: "專案", navKind: "none" }).canFocus).toBe(
      false,
    );
  });
});
