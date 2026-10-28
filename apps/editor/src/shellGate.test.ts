import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  _resetShellSessionForTests,
  ensureShellCleanForLeave,
  registerShellSession,
} from "./shellGate";

describe("ensureShellCleanForLeave", () => {
  beforeEach(() => {
    _resetShellSessionForTests();
  });

  it("returns true when no session", async () => {
    await expect(ensureShellCleanForLeave(vi.fn())).resolves.toBe(true);
  });

  it("returns true when clean without saving", async () => {
    const save = vi.fn();
    registerShellSession({ getDirty: () => false, save });
    await expect(ensureShellCleanForLeave(vi.fn())).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("saves when dirty then allows leave", async () => {
    let dirty = true;
    const save = vi.fn(async () => {
      dirty = false;
    });
    registerShellSession({ getDirty: () => dirty, save });
    const alertFn = vi.fn();
    await expect(ensureShellCleanForLeave(alertFn)).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(alertFn).not.toHaveBeenCalled();
  });

  it("blocks when save throws", async () => {
    registerShellSession({
      getDirty: () => true,
      save: async () => {
        throw new Error("disk");
      },
    });
    const alertFn = vi.fn();
    await expect(ensureShellCleanForLeave(alertFn)).resolves.toBe(false);
    expect(alertFn).toHaveBeenCalled();
  });

  it("blocks when save returns but still dirty", async () => {
    const save = vi.fn(async () => undefined);
    registerShellSession({
      getDirty: () => true,
      save,
    });
    const alertFn = vi.fn();
    await expect(ensureShellCleanForLeave(alertFn)).resolves.toBe(false);
    expect(save).toHaveBeenCalledTimes(8);
    expect(alertFn.mock.calls[0]?.[0]).toMatch(/仍有未儲存/);
  });

  it("allows leave only after a later save in the loop clears dirty", async () => {
    let n = 0;
    let dirty = true;
    const save = vi.fn(async () => {
      n += 1;
      if (n >= 2) dirty = false;
    });
    registerShellSession({ getDirty: () => dirty, save });
    const alertFn = vi.fn();
    await expect(ensureShellCleanForLeave(alertFn)).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(alertFn).not.toHaveBeenCalled();
  });
});
