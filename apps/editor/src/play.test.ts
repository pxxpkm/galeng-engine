import { describe, expect, it, vi } from "vitest";
import {
  launchPlay,
  playFromHereDecision,
  playFromStartBody,
  playNoticeKey,
  runPlayFromHere,
} from "./play";

describe("launchPlay", () => {
  it("plays without saving when clean", async () => {
    const save = vi.fn();
    const play = vi.fn();
    await expect(launchPlay({ dirty: false, save, play })).resolves.toBe("played");
    expect(save).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledOnce();
  });

  it("saves then plays when dirty", async () => {
    const save = vi.fn();
    const play = vi.fn();
    await expect(launchPlay({ dirty: true, save, play })).resolves.toBe("saved-then-played");
    expect(save).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledOnce();
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(play.mock.invocationCallOrder[0]!);
  });

  it("does not play when save fails", async () => {
    const save = vi.fn().mockRejectedValue(new Error("schema"));
    const play = vi.fn();
    await expect(launchPlay({ dirty: true, save, play })).rejects.toThrow("schema");
    expect(play).not.toHaveBeenCalled();
  });
});

describe("playFromHereDecision", () => {
  it("spawns a dialogue scene at this beat with the same body", () => {
    const decision = playFromHereDecision({
      sceneId: "park_01",
      beat: 2,
      sceneKind: "dialogue",
      startScene: "park_01",
    });
    expect(decision).toEqual({
      action: "spawn",
      body: { scene: "park_01", beat: 2 },
      notice: "dialogue-initial",
    });
    expect(playNoticeKey("dialogue-initial")).toBe("editor.playDialogueInitial");
  });

  it("still spawns the opening explore room and keeps the body", () => {
    const decision = playFromHereDecision({
      sceneId: "study",
      beat: 0,
      sceneKind: "explore",
      startScene: "study",
    });
    expect(decision).toEqual({
      action: "spawn",
      body: { scene: "study", beat: 0 },
      notice: "explore-onenter",
    });
  });

  it("refuses a non-start explore room and does not launch", async () => {
    const decision = playFromHereDecision({
      sceneId: "study",
      beat: 4,
      hotspots: [{ id: "desk" }],
      startScene: "hall",
    });
    expect(decision).toEqual({ action: "refuse", notice: "explore-not-start" });
    const launch = vi.fn();
    await expect(runPlayFromHere({ decision, launch })).resolves.toBe("refused");
    expect(launch).not.toHaveBeenCalled();
    expect(playFromStartBody("hall")).toEqual({ scene: "hall", beat: 0 });
    expect(playNoticeKey("explore-not-start")).toBe("editor.playExploreRefused");
  });

  it("keeps an explicit dialogue scene with hotspots on the spawn path", async () => {
    const decision = playFromHereDecision({
      sceneId: "talk",
      beat: 1,
      sceneKind: "dialogue",
      hotspots: [{ id: "desk" }],
      startScene: "hall",
    });
    const launch = vi.fn().mockResolvedValue(undefined);
    await expect(runPlayFromHere({ decision, launch })).resolves.toBe("spawned");
    expect(launch).toHaveBeenCalledOnce();
    expect(decision).toMatchObject({ action: "spawn", body: { scene: "talk", beat: 1 } });
  });
});
