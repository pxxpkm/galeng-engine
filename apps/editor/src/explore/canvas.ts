import type { Hotspot, HotspotShape } from "./types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Schema requires integer hotspot coords (1920×1080 logical stage). */
export function intCoord(n: number): number {
  return Math.round(n);
}

export function roundRect(rect: Rect): Rect {
  return {
    x: intCoord(rect.x),
    y: intCoord(rect.y),
    w: Math.max(1, intCoord(rect.w)),
    h: Math.max(1, intCoord(rect.h)),
  };
}

export function isRect(shape: HotspotShape): shape is Rect & { type: "rect" } {
  return shape.type === "rect";
}

export function isPolygon(
  shape: HotspotShape,
): shape is { type: "polygon"; points: [number, number][] } {
  return shape.type === "polygon";
}

/** Axis-aligned bounds of a polygon (for labels). */
export function polygonBounds(points: [number, number][]): Rect | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return roundRect({
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  });
}

/** Ray-casting point-in-polygon (stage coords). */
export function pointInPolygon(
  px: number,
  py: number,
  points: [number, number][],
): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i]![0];
    const yi = points[i]![1];
    const xj = points[j]![0];
    const yj = points[j]![1];
    const denom = yj - yi || 1e-12;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** SVG points attribute from polygon vertices. */
export function polygonSvgPoints(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

export function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.max(1, Math.abs(b.x - a.x));
  const h = Math.max(1, Math.abs(b.y - a.y));
  return roundRect({ x, y, w, h });
}

export function clampRect(rect: Rect, bounds: { width: number; height: number }): Rect {
  const r = roundRect(rect);
  const w = Math.max(1, Math.min(r.w, bounds.width));
  const h = Math.max(1, Math.min(r.h, bounds.height));
  const x = Math.max(0, Math.min(r.x, bounds.width - w));
  const y = Math.max(0, Math.min(r.y, bounds.height - h));
  return roundRect({ x, y, w, h });
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h;
}

/** Later hotspots win (same as runtime hit-test). Rect + polygon. */
export function hitTestHotspots(hotspots: Hotspot[], px: number, py: number): string | null {
  for (let i = hotspots.length - 1; i >= 0; i -= 1) {
    const h = hotspots[i]!;
    if (h.shape.type === "rect" && pointInRect(px, py, h.shape)) return h.id;
    if (h.shape.type === "polygon" && pointInPolygon(px, py, h.shape.points)) return h.id;
  }
  return null;
}

export type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

/** Eight resize handles, corners then edges (hit-test order prefers corners). */
export const HANDLES: readonly Handle[] = [
  "nw",
  "ne",
  "sw",
  "se",
  "n",
  "s",
  "e",
  "w",
];

/** Fallback pad in stage coords when display size is unknown (≈1:1). */
export const HANDLE_PAD = 8;

/** Target hit / visual size in CSS (screen) pixels when the stage is scaled. */
export const HANDLE_SCREEN_PX = 8;

/**
 * Stage-space hit radius so ~HANDLE_SCREEN_PX screen pixels stay clickable
 * when the canvas CSS width ≠ logical stage width (e.g. 640px showing 1920).
 */
export function handlePadStage(stageWidth: number, displayWidth: number): number {
  if (!(stageWidth > 0) || !(displayWidth > 0)) return HANDLE_PAD;
  return Math.max(2, (HANDLE_SCREEN_PX * stageWidth) / displayWidth);
}

export function handleCenters(rect: Rect): { h: Handle; cx: number; cy: number }[] {
  const { x, y, w, h } = rect;
  return [
    { h: "nw", cx: x, cy: y },
    { h: "ne", cx: x + w, cy: y },
    { h: "sw", cx: x, cy: y + h },
    { h: "se", cx: x + w, cy: y + h },
    { h: "n", cx: x + w / 2, cy: y },
    { h: "s", cx: x + w / 2, cy: y + h },
    { h: "e", cx: x + w, cy: y + h / 2 },
    { h: "w", cx: x, cy: y + h / 2 },
  ];
}

export function hitTestHandle(
  rect: Rect,
  px: number,
  py: number,
  pad: number = HANDLE_PAD,
): Handle | null {
  for (const p of handleCenters(rect)) {
    if (Math.abs(px - p.cx) <= pad && Math.abs(py - p.cy) <= pad) return p.h;
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
  return roundRect({ x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h });
}

/** Nudge rect by dx/dy stage units, clamped to stage bounds. */
export function nudgeRect(
  rect: Rect,
  dx: number,
  dy: number,
  bounds: { width: number; height: number },
): Rect {
  return clampRect(moveRect(rect, dx, dy), bounds);
}

/**
 * Translate polygon by dx/dy without distorting shape.
 * Clamps so the axis-aligned bounds stay inside the stage.
 */
export function nudgePolygonPoints(
  points: [number, number][],
  dx: number,
  dy: number,
  bounds: { width: number; height: number },
): [number, number][] {
  const b = polygonBounds(points);
  if (!b) return roundPolygonPoints(points);
  const moved = clampRect(moveRect(b, dx, dy), bounds);
  const adx = moved.x - b.x;
  const ady = moved.y - b.y;
  if (adx === 0 && ady === 0) return roundPolygonPoints(points);
  return roundPolygonPoints(points.map(([x, y]) => [x + adx, y + ady]));
}

/** True if number is a finite integer (schema-aligned). */
export function isIntCoord(n: number): boolean {
  return Number.isFinite(n) && Number.isInteger(n);
}

export function rectHasNonInteger(rect: Rect): boolean {
  return !(
    isIntCoord(rect.x) &&
    isIntCoord(rect.y) &&
    isIntCoord(rect.w) &&
    isIntCoord(rect.h)
  );
}

/** data-testid for a visible resize handle on the selected hotspot. */
export function resizeHandleTestId(hotspotId: string, handle: Handle): string {
  return `resize-handle-${hotspotId}-${handle}`;
}

/** Screen-pixel distance before move/resize becomes an active drag (avoids click→dirty). */
export const DRAG_THRESHOLD_SCREEN_PX = 4;

export function pastDragThreshold(
  start: { clientX: number; clientY: number },
  current: { clientX: number; clientY: number },
  thresholdPx: number = DRAG_THRESHOLD_SCREEN_PX,
): boolean {
  const dx = current.clientX - start.clientX;
  const dy = current.clientY - start.clientY;
  return Math.hypot(dx, dy) >= thresholdPx;
}

const DEFAULT_HS_W = 200;
const DEFAULT_HS_H = 160;
const PLACE_OFFSET = 24;

/**
 * Default rect for 「＋熱區」: first near canvas centre; later offset from the
 * last rect hotspot so they do not stack at (100,100).
 */
export function defaultHotspotPlacement(
  hotspots: Hotspot[],
  resolution: { width: number; height: number },
  size: { w: number; h: number } = { w: DEFAULT_HS_W, h: DEFAULT_HS_H },
): Rect {
  const centered = (): Rect =>
    clampRect(
      {
        x: Math.round((resolution.width - size.w) / 2),
        y: Math.round((resolution.height - size.h) / 2),
        w: size.w,
        h: size.h,
      },
      resolution,
    );

  for (let i = hotspots.length - 1; i >= 0; i -= 1) {
    const shape = hotspots[i]!.shape;
    if (shape.type === "rect") {
      return clampRect(
        {
          x: shape.x + PLACE_OFFSET,
          y: shape.y + PLACE_OFFSET,
          w: size.w,
          h: size.h,
        },
        resolution,
      );
    }
  }
  return centered();
}


/** Clamp a stage point into [0,width]×[0,height] (integer). */
export function clampPoint(
  x: number,
  y: number,
  bounds: { width: number; height: number },
): [number, number] {
  return [
    Math.max(0, Math.min(intCoord(x), bounds.width)),
    Math.max(0, Math.min(intCoord(y), bounds.height)),
  ];
}

/** Round all polygon vertices to integer stage coords. */
export function roundPolygonPoints(points: [number, number][]): [number, number][] {
  return points.map(([x, y]) => [intCoord(x), intCoord(y)]);
}

export function pointsEqual(a: [number, number][], b: [number, number][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]![0] !== b[i]![0] || a[i]![1] !== b[i]![1]) return false;
  }
  return true;
}

/** Hit-test polygon vertices (first match wins). */
export function hitTestVertex(
  points: [number, number][],
  px: number,
  py: number,
  pad: number = HANDLE_PAD,
): number | null {
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i]!;
    if (Math.abs(px - x) <= pad && Math.abs(py - y) <= pad) return i;
  }
  return null;
}

/** Closest point on segment AB and distance (for edge insert). */
export function distPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { dist: number; t: number; qx: number; qy: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return { dist: Math.hypot(px - qx, py - qy), t, qx, qy };
}

/**
 * Nearest polygon edge within pad (skips near-vertex ends so vertex handles win).
 * edgeIndex is the start vertex of the edge (insert after it).
 */
export function hitTestPolygonEdge(
  points: [number, number][],
  px: number,
  py: number,
  pad: number = HANDLE_PAD,
): { edgeIndex: number; qx: number; qy: number } | null {
  if (points.length < 2) return null;
  let best: { edgeIndex: number; qx: number; qy: number; dist: number } | null = null;
  for (let i = 0; i < points.length; i += 1) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % points.length]!;
    const { dist, t, qx, qy } = distPointToSegment(px, py, ax, ay, bx, by);
    if (t < 0.05 || t > 0.95) continue;
    if (dist <= pad && (!best || dist < best.dist)) {
      best = { edgeIndex: i, qx, qy, dist };
    }
  }
  return best ? { edgeIndex: best.edgeIndex, qx: best.qx, qy: best.qy } : null;
}

/** Replace one vertex (copies array). */
export function setPolygonVertex(
  points: [number, number][],
  index: number,
  x: number,
  y: number,
): [number, number][] {
  return points.map((p, i) =>
    i === index ? ([intCoord(x), intCoord(y)] as [number, number]) : ([p[0], p[1]] as [number, number]),
  );
}

/** Insert a vertex after edge starting at afterIndex (between i and i+1). */
export function insertPolygonVertex(
  points: [number, number][],
  afterIndex: number,
  x: number,
  y: number,
): [number, number][] {
  const next = points.map((p) => [p[0], p[1]] as [number, number]);
  const insertAt = Math.max(0, Math.min(afterIndex + 1, next.length));
  next.splice(insertAt, 0, [intCoord(x), intCoord(y)]);
  return next;
}

/**
 * Remove a vertex; returns null if fewer than 3 would remain or index invalid.
 */
export function removePolygonVertex(
  points: [number, number][],
  index: number,
): [number, number][] | null {
  if (points.length <= 3) return null;
  if (index < 0 || index >= points.length) return null;
  return points
    .filter((_, i) => i !== index)
    .map((p) => [p[0], p[1]] as [number, number]);
}

/** data-testid for a visible vertex handle on the selected polygon. */
export function vertexHandleTestId(hotspotId: string, index: number): string {
  return `vertex-handle-${hotspotId}-${index}`;
}
