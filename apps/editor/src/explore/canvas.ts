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

/** Later hotspots win (same as runtime hit-test). Polygons ignored for edit hit. */
export function hitTestHotspots(hotspots: Hotspot[], px: number, py: number): string | null {
  for (let i = hotspots.length - 1; i >= 0; i -= 1) {
    const h = hotspots[i]!;
    if (h.shape.type === "rect" && pointInRect(px, py, h.shape)) return h.id;
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

