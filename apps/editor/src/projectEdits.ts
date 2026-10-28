/** Apply edits relative to a baseline onto the latest JSON. Arrays are atomic fields. */
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function mergeProjectEdits<T>(baseline: T, draft: T, latest: T): T {
  if (!object(baseline) || !object(draft) || !object(latest)) {
    return (JSON.stringify(baseline) === JSON.stringify(draft) ? latest : draft);
  }
  const result: Record<string, unknown> = { ...latest };
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(draft)])) {
    const before = baseline[key];
    const after = draft[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (after === undefined) {
      delete result[key];
    } else if (object(after)) {
      result[key] = mergeProjectEdits(object(before) ? before : {}, after,
        object(latest[key]) ? latest[key] : {});
    } else {
      result[key] = after;
    }
  }
  return result as T;
}
