import { describe, expect, it, vi } from "vitest";
import { launchPlay } from "./play";

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
