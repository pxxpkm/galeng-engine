import { enqueueLane } from "./saveLane";

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return (await res.json()) as T;
}

// Private: callers must already hold the path's lane.
async function putPayload<T>(path: string, payload: string | undefined): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
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
  return (await res.json()) as T;
}

export async function deleteJson<T>(path: string): Promise<T> {
  // Drain earlier writes before deleting; otherwise a pending PUT can recreate it.
  return enqueueLane(path, async () => {
    const res = await fetch(path, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as T;
  });
}
