import { cloneDoc, type ExploreDoc } from "./types";

const LIMIT = 100;

export interface Command {
  readonly id: string;
  readonly label: string;
  apply(doc: ExploreDoc): ExploreDoc;
}

export interface CommandBusState {
  past: { label: string; before: ExploreDoc }[];
  future: { label: string; after: ExploreDoc }[];
}

export function emptyBus(): CommandBusState {
  return { past: [], future: [] };
}

/** Apply a command; clears redo. Returns next doc. */
export function dispatch(
  bus: CommandBusState,
  doc: ExploreDoc,
  cmd: Command,
): { bus: CommandBusState; doc: ExploreDoc } {
  const before = cloneDoc(doc);
  const next = cmd.apply(cloneDoc(doc));
  return {
    bus: {
      past: [...bus.past, { label: cmd.label, before }].slice(-LIMIT),
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
  return {
    bus: {
      past,
      future: [...bus.future, { label: entry.label, after: cloneDoc(current) }],
    },
    doc: cloneDoc(entry.before),
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
  return {
    bus: {
      past: [...bus.past, { label: entry.label, before: cloneDoc(current) }].slice(-LIMIT),
      future,
    },
    doc: cloneDoc(entry.after),
    label: entry.label,
  };
}

/** Pure UI selection changes do NOT go through undo (transient). */
export function patchUi(doc: ExploreDoc, patch: Partial<ExploreDoc["ui"]>): ExploreDoc {
  return { ...doc, ui: { ...doc.ui, ...patch } };
}
