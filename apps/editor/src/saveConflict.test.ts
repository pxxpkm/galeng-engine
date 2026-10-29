import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetEtagsForTests,
  _setEtagForTests,
  draftAfterConflict,
  getJson,
  isSaveConflict,
  postJson,
  putJson,
  SaveConflictError,
  storedEtag,
} from "./api";
import { exploreSaveStatus, EXPLORE_CONFLICT_STATUS } from "./explore/persist";
import { _resetLanesForTests } from "./saveLane";

interface DiskFile {
  body: unknown;
  etag: string;
}

function diskServer() {
  const files = new Map<string, DiskFile>();
  let n = 0;
  const next = () => {
    n += 1;
    return `"t${n}"`;
  };
  return {
    files,
    seed(path: string, body: unknown) {
      files.set(path, { body, etag: next() });
    },
    fetch: async (url: string, init?: RequestInit) => {
      const path = String(url);
      const method = init?.method ?? "GET";
      if (method === "GET") {
        const file = files.get(path);
        if (!file) return new Response("missing", { status: 404 });
        return new Response(JSON.stringify(file.body), {
          status: 200,
          headers: { ETag: file.etag },
        });
      }
      if (method === "POST" && path === "/api/scenes") {
        const body = JSON.parse(String(init?.body)) as { id: string };
        const key = `/api/scenes/${body.id}`;
        const etag = next();
        files.set(key, { body, etag });
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { ETag: etag },
        });
      }
      if (method === "PUT") {
        const file = files.get(path);
        const ifMatch = new Headers(init?.headers).get("If-Match");
        if (!file || ifMatch !== file.etag) {
          return new Response(
            JSON.stringify({
              error: "conflict",
              etag: file?.etag ?? "",
              document: file?.body ?? null,
            }),
            { status: 409, headers: file ? { ETag: file.etag } : {} },
          );
        }
        const body = JSON.parse(String(init?.body)) as unknown;
        const etag = next();
        files.set(path, { body, etag });
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { ETag: etag },
        });
      }
      return new Response("no", { status: 500 });
    },
  };
}

describe("E01b If-Match", () => {
  afterEach(() => {
    _resetLanesForTests();
    _resetEtagsForTests();
    vi.unstubAllGlobals();
  });

  it("lets one client save twice and rejects a stale writer without replacing the draft", async () => {
    const server = diskServer();
    server.seed("/api/project", { title: "Disk" });
    vi.stubGlobal("fetch", server.fetch);

    await getJson("/api/project");
    const stale = storedEtag("/api/project");
    expect(stale).toBeTruthy();

    await putJson("/api/project", { title: "A" });
    expect(server.files.get("/api/project")?.body).toEqual({ title: "A" });
    expect(storedEtag("/api/project")).not.toBe(stale);

    await putJson("/api/project", { title: "A2" });
    expect(server.files.get("/api/project")?.body).toEqual({ title: "A2" });

    _setEtagForTests("/api/project", stale!);
    const draft = { title: "B" };
    let kept = draft;
    try {
      await putJson("/api/project", draft);
      throw new Error("stale put should conflict");
    } catch (err) {
      expect(isSaveConflict(err)).toBe(true);
      expect(err).toBeInstanceOf(SaveConflictError);
      if (isSaveConflict(err)) {
        expect(err.code).toBe("conflict");
        expect(err.document).toEqual({ title: "A2" });
      }
      const after = draftAfterConflict(kept);
      expect(after.clearDirty).toBe(false);
      expect(after.conflict).toBe(true);
      kept = after.value;
    }
    expect(kept).toEqual({ title: "B" });
    expect(server.files.get("/api/project")?.body).toEqual({ title: "A2" });
    expect(exploreSaveStatus(new SaveConflictError("x", { title: "A2" }))).toBe(
      EXPLORE_CONFLICT_STATUS,
    );
  });

  it("refuses a PUT that never learned an ETag", async () => {
    const server = diskServer();
    server.seed("/api/scenes/room", { id: "room", title: "Room" });
    vi.stubGlobal("fetch", server.fetch);
    await expect(putJson("/api/scenes/room", { id: "room", title: "Nope" })).rejects.toBeInstanceOf(
      SaveConflictError,
    );
    expect(server.files.get("/api/scenes/room")?.body).toEqual({ id: "room", title: "Room" });
  });

  it("stores the ETag from create so the next scene PUT matches", async () => {
    const server = diskServer();
    vi.stubGlobal("fetch", server.fetch);
    await postJson("/api/scenes", { id: "room", title: "Room" });
    expect(storedEtag("/api/scenes/room")).toBeTruthy();
    await putJson("/api/scenes/room", { id: "room", title: "Room 2" });
    expect(server.files.get("/api/scenes/room")?.body).toEqual({ id: "room", title: "Room 2" });
  });
});
