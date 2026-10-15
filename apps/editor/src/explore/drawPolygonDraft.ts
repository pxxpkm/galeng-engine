import { clampPoint, intCoord, polygonSvgPoints } from "./canvas";

export type StagePt = [number, number];

/** Drop consecutive duplicate vertices; drop last if it equals first (accidental close). */
export function dedupePolygonDraft(points: StagePt[]): StagePt[] {
  const out: StagePt[] = [];
  for (const p of points) {
    const x = intCoord(p[0]);
    const y = intCoord(p[1]);
    const last = out[out.length - 1];
    if (last && last[0] === x && last[1] === y) continue;
    out.push([x, y]);
  }
  if (
    out.length >= 2 &&
    out[0]![0] === out[out.length - 1]![0] &&
    out[0]![1] === out[out.length - 1]![1]
  ) {
    out.pop();
  }
  return out;
}

/** True when a finished hotspot can be created (≥3 unique verts after dedupe). */
export function canFinishDrawPolygon(points: StagePt[]): boolean {
  return dedupePolygonDraft(points).length >= 3;
}

/** Append a clamped stage point (integer coords). */
export function appendDrawPolygonPoint(
  points: StagePt[],
  x: number,
  y: number,
  bounds?: { width: number; height: number },
): StagePt[] {
  const [cx, cy] = bounds ? clampPoint(x, y, bounds) : [intCoord(x), intCoord(y)];
  return [...points, [cx, cy]];
}

/** Remove the last draft vertex (no-op when empty). */
export function undoDrawPolygonPoint(points: StagePt[]): StagePt[] {
  if (points.length === 0) return points;
  return points.slice(0, -1);
}

/**
 * Finalize points for addHotspot polygon shape.
 * Returns null when fewer than 3 unique vertices remain.
 */
export function finalizeDrawPolygonPoints(points: StagePt[]): StagePt[] | null {
  const clean = dedupePolygonDraft(points);
  return clean.length >= 3 ? clean : null;
}

export type DrawPolygonKeyAction = "finish" | "cancel" | "undoPoint";

/**
 * Pure key routing while the draw-polygon tool has an in-progress draft
 * (or empty draft still in tool mode for Esc→cancel).
 */
export function drawPolygonKeyAction(
  key: string,
  opts: { inEditableField: boolean; pointCount: number },
): DrawPolygonKeyAction | null {
  if (opts.inEditableField) return null;
  if (key === "Escape") return "cancel";
  if (key === "Enter" && opts.pointCount >= 3) return "finish";
  if ((key === "Backspace" || key === "Delete") && opts.pointCount > 0) {
    return "undoPoint";
  }
  return null;
}

/**
 * Preview geometry: placed vertices + optional rubber-band to cursor,
 * plus a closing hint from cursor (or last) back to the first vertex.
 */
export function drawPolygonPreviewGeometry(
  points: StagePt[],
  cursor: { x: number; y: number } | null,
): {
  /** SVG points for the open polyline (placed + cursor). */
  polyline: string;
  /** SVG points for a translucent closed preview when ≥2 placed + cursor (or ≥3 placed). */
  closedFill: string | null;
  /** Dashed closing segment from tip→first when ≥1 placed. */
  closeEdge: { x1: number; y1: number; x2: number; y2: number } | null;
} {
  const tip = cursor
    ? ([intCoord(cursor.x), intCoord(cursor.y)] as StagePt)
    : null;
  const open: StagePt[] = tip ? [...points, tip] : [...points];
  const polyline = open.length > 0 ? polygonSvgPoints(open) : "";

  let closedFill: string | null = null;
  if (points.length >= 3 && !tip) {
    closedFill = polygonSvgPoints(points);
  } else if (points.length >= 2 && tip) {
    closedFill = polygonSvgPoints([...points, tip]);
  }

  let closeEdge: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (points.length >= 1) {
    const first = points[0]!;
    const from = tip ?? points[points.length - 1]!;
    if (from[0] !== first[0] || from[1] !== first[1]) {
      closeEdge = { x1: from[0], y1: from[1], x2: first[0], y2: first[1] };
    }
  }

  return { polyline, closedFill, closeEdge };
}
