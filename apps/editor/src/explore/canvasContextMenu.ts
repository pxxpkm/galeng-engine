/**
 * Phase A canvas context-menu: blank / rect / polygon basics (no vertex edit).
 */

import {
  clampRect,
  intCoord,
  polygonBounds,
  roundRect,
  type Rect,
} from "./canvas";
import type { Hotspot, HotspotShape } from "./types";

export const CTX_DEFAULT_W = 200;
export const CTX_DEFAULT_H = 160;

export type CtxMenuTarget =
  | { kind: "blank"; stageX: number; stageY: number }
  | { kind: "rect"; hotspotId: string; stageX: number; stageY: number }
  | { kind: "polygon"; hotspotId: string; stageX: number; stageY: number };

export type CtxMenuActionId =
  | "addRect"
  | "addPolygon"
  | "toPolygon"
  | "toRect"
  | "delete"
  | "cancel";

export interface CtxMenuItem {
  id: CtxMenuActionId;
  label: string;
}

/** Menu rows for a right-click target (Traditional Chinese 書面語). */
export function canvasContextMenuItems(target: CtxMenuTarget): CtxMenuItem[] {
  switch (target.kind) {
    case "blank":
      return [
        { id: "addRect", label: "新增矩形熱區（於此）" },
        { id: "addPolygon", label: "新增多邊形熱區（於此）" },
        { id: "cancel", label: "取消" },
      ];
    case "rect":
      return [
        { id: "toPolygon", label: "轉為多邊形" },
        { id: "delete", label: "刪除熱區" },
        { id: "cancel", label: "取消" },
      ];
    case "polygon":
      return [
        { id: "toRect", label: "轉為矩形" },
        { id: "delete", label: "刪除熱區" },
        { id: "cancel", label: "取消" },
      ];
  }
}

/** Resolve hit hotspot → menu target (blank if miss). */
export function canvasContextMenuTarget(
  hotspots: Hotspot[],
  stageX: number,
  stageY: number,
  hitId: string | null,
): CtxMenuTarget {
  if (!hitId) return { kind: "blank", stageX, stageY };
  const hs = hotspots.find((h) => h.id === hitId);
  if (!hs) return { kind: "blank", stageX, stageY };
  if (hs.shape.type === "polygon") {
    return { kind: "polygon", hotspotId: hitId, stageX, stageY };
  }
  return { kind: "rect", hotspotId: hitId, stageX, stageY };
}

/** Rect centered on stage point (clamped to resolution when given). */
export function rectCenteredAt(
  px: number,
  py: number,
  size: { w: number; h: number } = { w: CTX_DEFAULT_W, h: CTX_DEFAULT_H },
  resolution?: { width: number; height: number },
): Rect {
  const r = roundRect({
    x: px - Math.round(size.w / 2),
    y: py - Math.round(size.h / 2),
    w: size.w,
    h: size.h,
  });
  return resolution ? clampRect(r, resolution) : r;
}

/**
 * Default quad around click (Phase A: visible/selectable polygon without
 * point-by-point draw). Points are integer stage coords.
 */
export function defaultQuadAround(
  px: number,
  py: number,
  size: { w: number; h: number } = { w: CTX_DEFAULT_W, h: CTX_DEFAULT_H },
  resolution?: { width: number; height: number },
): [number, number][] {
  const box = rectCenteredAt(px, py, size, resolution);
  return [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x + box.w, box.y + box.h],
    [box.x, box.y + box.h],
  ];
}

/** Rect corners → polygon (CCW from top-left). */
export function rectShapeToPolygon(
  shape: Extract<HotspotShape, { type: "rect" }>,
): Extract<HotspotShape, { type: "polygon" }> {
  const { x, y, w, h } = shape;
  return {
    type: "polygon",
    points: [
      [intCoord(x), intCoord(y)],
      [intCoord(x + w), intCoord(y)],
      [intCoord(x + w), intCoord(y + h)],
      [intCoord(x), intCoord(y + h)],
    ],
  };
}

/** Polygon → axis-aligned bounding rect. */
export function polygonShapeToRect(
  points: [number, number][],
): Extract<HotspotShape, { type: "rect" }> {
  const b = polygonBounds(points) ?? { x: 0, y: 0, w: 1, h: 1 };
  return { type: "rect", ...b };
}

/** Convert shape rect↔polygon; null if already that kind / unsupported. */
export function convertHotspotShape(
  shape: HotspotShape,
  to: "rect" | "polygon",
): HotspotShape | null {
  if (to === "polygon") {
    if (shape.type !== "rect") return null;
    return rectShapeToPolygon(shape);
  }
  if (shape.type !== "polygon") return null;
  return polygonShapeToRect(shape.points);
}
