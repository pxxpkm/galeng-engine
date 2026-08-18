import { describe, expect, it } from "vitest";
import { backupKey, backupNeedsOffer, clearBackup, readBackup, writeBackup } from "./backup";
import type { Scene } from "./types";

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
}

const scene: Scene = {
  id: "park_01",
  title: "公園",
  beats: [{ say: { speaker: "sora", text: "今天風真好。" } }],
};

describe("backup roundtrip", () => {
  it("writes and reads back the same scene", () => {
    const storage = memoryStorage();
    writeBackup(storage, scene);
    const snap = readBackup(storage, "park_01");
    expect(snap?.scene).toEqual(scene);
    expect(typeof snap?.savedAt).toBe("number");
  });

  it("clearBackup removes the entry", () => {
    const storage = memoryStorage();
    writeBackup(storage, scene);
    clearBackup(storage, "park_01");
    expect(readBackup(storage, "park_01")).toBeNull();
  });

  it("ignores broken json, foreign ids, and missing beats", () => {
    const storage = memoryStorage();
    storage.setItem(backupKey("a"), "{not json");
    expect(readBackup(storage, "a")).toBeNull();
    storage.setItem(
      backupKey("b"),
      JSON.stringify({ scene: { id: "other", beats: [] }, savedAt: 1 }),
    );
    expect(readBackup(storage, "b")).toBeNull();
    storage.setItem(backupKey("c"), JSON.stringify({ scene: { id: "c" }, savedAt: 1 }));
    expect(readBackup(storage, "c")).toBeNull();
  });

  it("tolerates absent storage", () => {
    writeBackup(undefined, scene);
    expect(readBackup(undefined, "park_01")).toBeNull();
    clearBackup(undefined, "park_01");
  });
});

describe("backupNeedsOffer", () => {
  it("offers only when the backup differs from the saved scene", () => {
    const same = readBackup((() => {
      const storage = memoryStorage();
      writeBackup(storage, scene);
      return storage;
    })(), "park_01");
    expect(backupNeedsOffer(scene, same)).toBe(false);
    const edited: Scene = { ...scene, beats: [{ say: { speaker: "sora", text: "改過了。" } }] };
    const storage = memoryStorage();
    writeBackup(storage, edited);
    expect(backupNeedsOffer(scene, readBackup(storage, "park_01"))).toBe(true);
    expect(backupNeedsOffer(scene, null)).toBe(false);
  });
});
