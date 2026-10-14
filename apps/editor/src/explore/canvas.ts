import type { Hotspot, HotspotShape } from "./types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function isRect(shape: HotspotShape): shape is Rect & { type: "rect" } {
  return shape.type === "rect";
}

export function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.max(1, Math.abs(b.x - a.x));
  const h = Math.max(1, Math.abs(b.y - a.y));
  return { x, y, w, h };
}

export function clampRect(rect: Rect, bounds: { width: number; height: number }): Rect {
  const w = Math.max(1, Math.min(rect.w, bounds.width));
  const h = Math.max(1, Math.min(rect.h, bounds.height));
  const x = Math.max(0, Math.min(rect.x, bounds.width - w));
  const y = Math.max(0, Math.min(rect.y, bounds.height - h));
  return { x, y, w, h };
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h;
}

/** Later hotspots win (same as runtime hit-test). Polygons ignored for edit hit. */
export function hitTestHotspots(hotspots: Hotspot[], px: number, py: number): string | null {
  for (let i = hotspots.length - 1; i >= 0; i -= 1) {
    const h = hotspots[i]!;
    if (h.shape.type === "rect" && pointInRect(px, py, h.shape)) return h.id;
  }
  return null;
}

export type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const HANDLE_PAD = 8;

export function hitTestHandle(rect: Rect, px: number, py: number): Handle | null {
  const { x, y, w, h } = rect;
  const pts: { h: Handle; cx: number; cy: number }[] = [
    { h: "nw", cx: x, cy: y },
    { h: "ne", cx: x + w, cy: y },
    { h: "sw", cx: x, cy: y + h },
    { h: "se", cx: x + w, cy: y + h },
    { h: "n", cx: x + w / 2, cy: y },
    { h: "s", cx: x + w / 2, cy: y + h },
    { h: "w", cx: x, cy: y + h / 2 },
    { h: "e", cx: x + w, cy: y + h / 2 },
  ];
  for (const p of pts) {
    if (Math.abs(px - p.cx) <= HANDLE_PAD && Math.abs(py - p.cy) <= HANDLE_PAD) return p.h;
  }
  return null;
}

export function resizeRect(rect: Rect, handle: Handle, px: number, py: number): Rect {
  let { x, y, w, h } = rect;
  const r = x + w;
  const b = y + h;
  switch (handle) {
    case "nw":
      return normalizeRect({ x: px, y: py }, { x: r, y: b });
    case "ne":
      return normalizeRect({ x, y: py }, { x: px, y: b });
    case "sw":
      return normalizeRect({ x: px, y }, { x: r, y: py });
    case "se":
      return normalizeRect({ x, y }, { x: px, y: py });
    case "n":
      return normalizeRect({ x, y: py }, { x: r, y: b });
    case "s":
      return normalizeRect({ x, y }, { x: r, y: py });
    case "w":
      return normalizeRect({ x: px, y }, { x: r, y: b });
    case "e":
      return normalizeRect({ x, y }, { x: px, y: b });
  }
}

export function moveRect(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
}
