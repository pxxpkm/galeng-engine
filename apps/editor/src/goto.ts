import type { SceneMeta } from "./types";

export function gotoOptions(scenes: SceneMeta[], current: string): string[] {
  const ids = scenes.map((s) => s.id);
  if (current && !ids.includes(current)) {
    return [current, ...ids];
  }
  return ids;
}

/** Same rule as host `scene_path`: ASCII alnum / `_` / `-`, not empty. */
export function parseSceneId(raw: string): string | null {
  const id = raw.trim();
  if (id.length === 0) {
    return null;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return null;
  }
  return id;
}
