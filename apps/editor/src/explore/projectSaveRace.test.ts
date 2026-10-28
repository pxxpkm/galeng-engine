import { afterEach, expect, it, vi } from "vitest";
import { putJson } from "../api";
import { _resetLanesForTests } from "../saveLane";
import { blankExploreDoc } from "./fixture";
import { createHttpPersistApi, saveExploreDoc } from "./persist";

afterEach(() => { vi.unstubAllGlobals(); _resetLanesForTests(); });

it("room save reads project only after the pending Settings write completes", async () => {
  let disk: Record<string, unknown> = { titleBgm: "bgm/old" };
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>(r => { release = r; });
  const sending = new Promise<void>(r => { started = r; });
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/project" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      if (requests.length === 1) { started(); await pending; }
      disk = body;
      return new Response(JSON.stringify(disk));
    }
    return new Response(url === "/api/project" ? JSON.stringify(disk) : String(init?.body));
  }));
  const settings = putJson("/api/project", { titleBgm: "bgm/new", fonts: { ui: "fonts/new" } });
  await sending;
  const room = saveExploreDoc(createHttpPersistApi(), blankExploreDoc("study"));
  await Promise.resolve();
  expect(requests).toEqual(["PUT /api/project"]);
  release();
  await Promise.all([settings, room]);
  expect(requests).toEqual(["PUT /api/project", "GET /api/project", "PUT /api/project", "PUT /api/scenes/study"]);
  expect(disk.titleBgm).toBe("bgm/new");
  expect(disk.fonts).toEqual({ ui: "fonts/new" });
});

it("failed project reads do not write stale raw and do not strand later Settings saves", async () => {
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? "GET"} ${url}`);
    return init?.method === "PUT"
      ? new Response(String(init.body))
      : new Response("read failed", { status: 503 });
  }));
  const room = saveExploreDoc(createHttpPersistApi(), blankExploreDoc("study"));
  const settings = putJson("/api/project", { titleBgm: "bgm/new" });
  await expect(room).rejects.toThrow("read failed");
  await expect(settings).resolves.toEqual({ titleBgm: "bgm/new" });
  expect(requests).toEqual(["GET /api/project", "PUT /api/project"]);
});
