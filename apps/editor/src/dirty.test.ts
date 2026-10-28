import { describe, expect, it, vi } from "vitest";
import {
  confirmDiscardIfDirty,
  flushIfDirty,
  flushThenAllowLeave,
  LEAVE_CANCELLED_MESSAGE,
  sceneLeaveBlocked,
  shouldWarnUnload,
} from "./dirty";

describe("flushIfDirty", () => {
  it("does not save when clean", async () => {
    const save = vi.fn();
    await expect(flushIfDirty(false, save, () => false)).resolves.toBe("clean");
    expect(save).not.toHaveBeenCalled();
  });

  it("saves when dirty", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await expect(flushIfDirty(true, save, () => false)).resolves.toBe("saved");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("propagates save errors", async () => {
    const save = vi.fn().mockRejectedValue(new Error("disk"));
    await expect(flushIfDirty(true, save, () => false)).rejects.toThrow("disk");
  });

  it("saves again when the first save leaves a newer edit dirty", async () => {
    let rev = 1;
    let dirty = true;
    const save = vi.fn(async () => {
      if (save.mock.calls.length === 1) {
        rev += 1;
        dirty = true;
        return;
      }
      dirty = false;
    });
    await expect(flushIfDirty(true, save, () => dirty)).resolves.toBe("saved");
    expect(save).toHaveBeenCalledTimes(2);
    expect(rev).toBe(2);
    expect(dirty).toBe(false);
  });

  it("throws after eight saves that are still dirty", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await expect(flushIfDirty(true, save, () => true)).rejects.toThrow(
      LEAVE_CANCELLED_MESSAGE,
    );
    expect(save).toHaveBeenCalledTimes(8);
  });
});

describe("scene leave after flush", () => {
  it("selectScene keeps the current id when an edit is visible after flush", async () => {
    let id = "A";
    let dirty = true;
    let observations = 0;
    const save = vi.fn(async () => {
      dirty = false;
    });
    const stillDirty = () => {
      observations += 1;
      if (observations >= 2) return true;
      return dirty;
    };
    try {
      await flushThenAllowLeave(true, save, stillDirty);
      id = "B";
    } catch (err) {
      expect((err as Error).message).toBe(LEAVE_CANCELLED_MESSAGE);
    }
    expect(id).toBe("A");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not switch to a duplicate when refs are dirty again after flush", async () => {
    let id = "A";
    let sceneDirty = true;
    let projectDirty = false;
    await flushThenAllowLeave(
      true,
      async () => {
        sceneDirty = false;
      },
      () => sceneLeaveBlocked(sceneDirty, projectDirty),
    );
    sceneDirty = true;
    const createdId = "A_copy";
    if (!sceneLeaveBlocked(sceneDirty, projectDirty)) {
      id = createdId;
    }
    expect(id).toBe("A");
    expect(sceneLeaveBlocked(false, true)).toBe(true);
    expect(sceneLeaveBlocked(false, false)).toBe(false);
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
