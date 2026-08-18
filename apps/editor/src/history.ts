import type { Scene } from "./types";

export interface Snapshot {
  scene: Scene;
  beatIndex: number;
}

export interface History {
  past: Snapshot[];
  future: Snapshot[];
}

export const emptyHistory = (): History => ({ past: [], future: [] });

const LIMIT = 80;

function cloneSnap(snap: Snapshot): Snapshot {
  return { scene: structuredClone(snap.scene), beatIndex: snap.beatIndex };
}

export function push(history: History, before: Snapshot): History {
  return {
    past: [...history.past, cloneSnap(before)].slice(-LIMIT),
    future: [],
  };
}

export function undo(
  history: History,
  current: Snapshot,
): { history: History; snap: Snapshot } | null {
  if (history.past.length === 0) return null;
  const past = history.past.slice();
  const snap = past.pop()!;
  return {
    history: { past, future: [...history.future, cloneSnap(current)] },
    snap,
  };
}

export function redo(
  history: History,
  current: Snapshot,
): { history: History; snap: Snapshot } | null {
  if (history.future.length === 0) return null;
  const future = history.future.slice();
  const snap = future.pop()!;
  return {
    history: { past: [...history.past, cloneSnap(current)].slice(-LIMIT), future },
    snap,
  };
}
