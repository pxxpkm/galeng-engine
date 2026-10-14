import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createHttpPackApi,
  formatExplorePackStatus,
  type PackResult,
} from "./packClient";

describe("formatExplorePackStatus", () => {
  it("shows pak path when clean", () => {
    const result: PackResult = { pak: "export/game/game.pak" };
    expect(formatExplorePackStatus(result)).toBe("已出包：export/game/game.pak");
  });

  it("includes exe when present", () => {
    const result: PackResult = {
      pak: "export/game/game.pak",
      exe: "export/game/player.exe",
    };
    expect(formatExplorePackStatus(result)).toBe(
      "已出包：export/game/game.pak + export/game/player.exe",
    );
  });

  it("notes warning count without listing all", () => {
    const result: PackResult = {
      pak: "export/game/game.pak",
      warnings: ["a", "b"],
    };
    expect(formatExplorePackStatus(result)).toBe(
      "已出包：export/game/game.pak（警告 2）",
    );
  });
});

describe("createHttpPackApi", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs /api/pack with empty body by default", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ pak: "export/game/game.pak", warnings: [] }),
    });
    const api = createHttpPackApi();
    const result = await api.pack();
    expect(result.pak).toBe("export/game/game.pak");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/pack");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({});
  });

  it("forwards out and strict", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ pak: "/tmp/out/game.pak" }),
    });
    await createHttpPackApi().pack({ out: " /tmp/out ", strict: true });
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body).toEqual({ out: "/tmp/out", strict: true });
  });

  it("surfaces non-OK response text", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: false,
      text: async () => "pack: strict missing asset",
    });
    await expect(createHttpPackApi().pack({ strict: true })).rejects.toThrow(
      /strict missing asset/,
    );
  });
});
