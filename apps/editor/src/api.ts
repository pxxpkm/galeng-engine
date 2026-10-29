import { enqueueLane } from "./saveLane";

/** Last strong ETag for a versioned document path. Not sent for other routes. */
const etags = new Map<string, string>();

export function _resetEtagsForTests(): void {
  etags.clear();
}

export function _setEtagForTests(path: string, etag: string): void {
  etags.set(path, etag);
}

export function storedEtag(path: string): string | undefined {
  return etags.get(path);
}

/**
 * Project and scene files are the versioned documents.
 * Create and unarchive responses belong to `/api/scenes/:id`, not the POST path.
 */
export function documentVersionKey(path: string, body?: unknown): string | null {
  if (path === "/api/project") return path;
  if (/^\/api\/scenes\/[^/]+$/.test(path)) return path;
  if (path === "/api/scenes") {
    const id = idOf(body);
    return id ? `/api/scenes/${id}` : null;
  }
  const unarchive = /^\/api\/scenes\/([^/]+)\/unarchive$/.exec(path);
  if (unarchive) return `/api/scenes/${unarchive[1]}`;
  return null;
}

function idOf(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("id" in body)) return null;
  const id = (body as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function rememberVersion(path: string, res: Response, body: unknown): void {
  const etag = res.headers?.get?.("ETag");
  if (!etag) return;
  const key = documentVersionKey(path, body);
  if (key) etags.set(key, etag);
}

export class SaveConflictError extends Error {
  readonly code = "conflict" as const;
  readonly etag: string;
  readonly document: unknown;

  constructor(etag: string, document: unknown) {
    super("conflict");
    this.name = "SaveConflictError";
    this.etag = etag;
    this.document = document;
  }
}

export function isSaveConflict(err: unknown): err is SaveConflictError {
  return err instanceof SaveConflictError;
}

/** 409 keeps the in-memory draft. The disk document stays on the error, not in the editor. */
export function draftAfterConflict<T>(draft: T): { value: T; clearDirty: false; conflict: true } {
  return { value: draft, clearDirty: false, conflict: true };
}

function conflictFromResponse(text: string): SaveConflictError {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    parsed = null;
  }
  const rec = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const etag = typeof rec.etag === "string" ? rec.etag : "";
  return new SaveConflictError(etag, "document" in rec ? rec.document : undefined);
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const body = (await res.json()) as T;
  rememberVersion(path, res, body);
  return body;
}

// Private: callers must already hold the path's lane.
async function putPayload<T>(path: string, payload: string | undefined): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = documentVersionKey(path);
  const etag = key ? etags.get(key) : undefined;
  if (etag) headers["If-Match"] = etag;
  const res = await fetch(path, {
    method: "PUT",
    headers,
    body: payload,
  });
  if (res.status === 409) {
    throw conflictFromResponse(await res.text());
  }
  if (!res.ok) throw new Error(await res.text());
  const body = (await res.json()) as T;
  rememberVersion(path, res, body);
  return body;
}

export async function putJson<T>(path: string, body: unknown): Promise<T> {
  const payload = JSON.stringify(body);
  return enqueueLane(path, () => putPayload<T>(path, payload));
}

/** Read and merge only when this writer owns the lane; never nest putJson here. */
export async function updateJson<T>(
  path: string,
  update: (current: T) => unknown,
): Promise<T> {
  return enqueueLane(path, async () => {
    const current = await getJson<T>(path);
    return putPayload<T>(path, JSON.stringify(update(current)));
  });
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const saved = (await res.json()) as T;
  rememberVersion(path, res, saved);
  return saved;
}

export async function deleteJson<T>(path: string): Promise<T> {
  // Drain earlier writes before deleting; otherwise a pending PUT can recreate it.
  return enqueueLane(path, async () => {
    const res = await fetch(path, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as T;
  });
}
