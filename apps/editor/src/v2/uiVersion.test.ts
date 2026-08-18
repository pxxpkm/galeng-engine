import { describe, expect, it } from "vitest";
import { getUiVersion } from "./uiVersion";

describe("getUiVersion", () => {
  it("defaults to v2 when storage is unavailable", () => {
    expect(getUiVersion()).toBe("v2");
  });

  it("returns classic only when the stored value is classic", () => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as Storage;
    expect(getUiVersion()).toBe("v2");
    store.set("galeng.uiVersion", "v2");
    expect(getUiVersion()).toBe("v2");
    store.set("galeng.uiVersion", "classic");
    expect(getUiVersion()).toBe("classic");
    store.set("galeng.uiVersion", "nope");
    expect(getUiVersion()).toBe("v2");
    // @ts-expect-error restore absence of localStorage
    delete globalThis.localStorage;
  });
});
