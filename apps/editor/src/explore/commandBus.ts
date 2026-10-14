import { sameProjectScene } from "./inspectorModel";
import { cloneDoc, type ExploreDoc } from "./types";

const LIMIT = 100;

export interface Command {
  readonly id: string;
  readonly label: string;
  /** When set, consecutive cmds with same key merge into one undo step. */
  readonly coalesceKey?: string;
  apply(doc: ExploreDoc): ExploreDoc;
}

interface HistoryEntry {
  label: string;
  before: ExploreDoc;
  coalesceKey?: string;
}

export interface CommandBusState {
  past: HistoryEntry[];
  future: { label: string; after: ExploreDoc }[];
}

export function emptyBus(): CommandBusState {
  return { past: [], future: [] };
}

/**
 * Apply a command; clears redo.
 * - No-op (project+scene unchanged) does not push history.
 * - Same coalesceKey as last entry merges (keeps original before).
 */
export function dispatch(
  bus: CommandBusState,
  doc: ExploreDoc,
  cmd: Command,
): { bus: CommandBusState; doc: ExploreDoc; coalesced?: boolean; skipped?: boolean } {
  const before = cloneDoc(doc);
  const next = cmd.apply(cloneDoc(doc));

  if (sameProjectScene(before, next)) {
    // Allow ui-only side effects from apply without stacking undo.
    return { bus, doc: next, skipped: true };
  }

  if (cmd.coalesceKey && bus.past.length > 0) {
    const last = bus.past[bus.past.length - 1]!;
    if (last.coalesceKey === cmd.coalesceKey) {
      return {
        bus: {
          past: [
            ...bus.past.slice(0, -1),
            { label: cmd.label, before: last.before, coalesceKey: cmd.coalesceKey },
          ],
          future: [],
        },
        doc: next,
        coalesced: true,
      };
    }
  }

  return {
    bus: {
      past: [
        ...bus.past,
        { label: cmd.label, before, coalesceKey: cmd.coalesceKey },
      ].slice(-LIMIT),
      future: [],
    },
    doc: next,
  };
}

export function canUndo(bus: CommandBusState): boolean {
  return bus.past.length > 0;
}

export function canRedo(bus: CommandBusState): boolean {
  return bus.future.length > 0;
}

export function undo(
  bus: CommandBusState,
  current: ExploreDoc,
): { bus: CommandBusState; doc: ExploreDoc; label: string } | null {
  if (bus.past.length === 0) return null;
  const past = bus.past.slice();
  const entry = past.pop()!;
  // Restore project+scene from before; keep current ui (tool / selection / clipboard).
  const restored = cloneDoc(entry.before);
  restored.ui = { ...current.ui };
  return {
    bus: {
      past,
      future: [...bus.future, { label: entry.label, after: cloneDoc(current) }],
    },
    doc: restored,
    label: entry.label,
  };
}

export function redo(
  bus: CommandBusState,
  current: ExploreDoc,
): { bus: CommandBusState; doc: ExploreDoc; label: string } | null {
  if (bus.future.length === 0) return null;
  const future = bus.future.slice();
  const entry = future.pop()!;
  const restored = cloneDoc(entry.after);
  restored.ui = { ...current.ui };
  return {
    bus: {
      past: [
        ...bus.past,
        { label: entry.label, before: cloneDoc(current) },
      ].slice(-LIMIT),
      future,
    },
    doc: restored,
    label: entry.label,
  };
}

/** Pure UI selection changes do NOT go through undo (transient). */
export function patchUi(doc: ExploreDoc, patch: Partial<ExploreDoc["ui"]>): ExploreDoc {
  return { ...doc, ui: { ...doc.ui, ...patch } };
}
