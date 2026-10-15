import { describe, expect, it, vi } from "vitest";
import { confirmDiscardIfDirty, flushIfDirty, shouldWarnUnload } from "./dirty";

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

describe("confirmDiscardIfDirty", () => {
  it("returns true when clean and does not call confirmFn", () => {
    const confirmFn = vi.fn(() => true);
    expect(confirmDiscardIfDirty(false, undefined, confirmFn)).toBe(true);
    expect(confirmFn).not.toHaveBeenCalled();
  });

  it("returns true when dirty and confirm accepts, calling confirmFn once with the default message", () => {
    const confirmFn = vi.fn(() => true);
    expect(confirmDiscardIfDirty(true, undefined, confirmFn)).toBe(true);
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(confirmFn).toHaveBeenCalledWith("有未儲存變更，確定要丟棄並重載？");
  });

  it("returns false when dirty and confirm rejects", () => {
    const confirmFn = vi.fn(() => false);
    expect(confirmDiscardIfDirty(true, undefined, confirmFn)).toBe(false);
  });

  it("passes a custom message to confirmFn", () => {
    const confirmFn = vi.fn(() => true);
    expect(confirmDiscardIfDirty(true, "自訂訊息", confirmFn)).toBe(true);
    expect(confirmFn).toHaveBeenCalledWith("自訂訊息");
  });
});
