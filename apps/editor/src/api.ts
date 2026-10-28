import { enqueueLane } from "./saveLane";

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return (await res.json()) as T;
}

export async function putJson<T>(path: string, body: unknown): Promise<T> {
  // Snapshot at call time. The fetch waits on this path's lane so two PUTs
  // to /api/project or the same /api/scenes/:id cannot overlap.
  const payload = JSON.stringify(body);
  return enqueueLane(path, async () => {
    const res = await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return (await res.json()) as T;
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
  return (await res.json()) as T;
}

export async function deleteJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return (await res.json()) as T;
}
