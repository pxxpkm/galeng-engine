import { describe, expect, it, vi } from "vitest";
import { flushIfDirty, shouldWarnUnload } from "./dirty";

describe("flushIfDirty", () => {
  it("does not save when clean", async () => {
    const save = vi.fn();
    await expect(flushIfDirty(false, save)).resolves.toBe("clean");
    expect(save).not.toHaveBeenCalled();
  });

  it("saves when dirty", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await expect(flushIfDirty(true, save)).resolves.toBe("saved");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("propagates save errors", async () => {
    const save = vi.fn().mockRejectedValue(new Error("disk"));
    await expect(flushIfDirty(true, save)).rejects.toThrow("disk");
  });
});

describe("shouldWarnUnload", () => {
  it("is true only when dirty", () => {
    expect(shouldWarnUnload(false)).toBe(false);
    expect(shouldWarnUnload(true)).toBe(true);
  });
});
