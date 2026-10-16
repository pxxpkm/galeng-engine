import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { mediaUrl } from "../media";
import {
  HANDLES,
  HANDLE_SCREEN_PX,
  clampPoint,
  clampRect,
  handlePadStage,
  hitTestHandle,
  hitTestHotspots,
  hitTestPolygonEdge,
  hitTestVertex,
  insertPolygonVertex,
  isPolygon,
  isRect,
  moveRect,
  normalizeRect,
  pastDragThreshold,
  pointsEqual,
  polygonBounds,
  polygonSvgPoints,
  removePolygonVertex,
  resizeHandleTestId,
  resizeRect,
  setPolygonVertex,
  vertexHandleTestId,
  type Handle,
  type Rect,
} from "./canvas";
import { CanvasContextMenu } from "./CanvasContextMenu";
import {
  canvasContextMenuItems,
  canvasContextMenuTarget,
  type CtxMenuActionId,
  type CtxMenuTarget,
} from "./ctxMenuModel";
import type { ExploreDoc } from "./types";
import {
  appendDrawPolygonPoint,
  drawPolygonKeyAction,
  drawPolygonPreviewGeometry,
  finalizeDrawPolygonPoints,
  undoDrawPolygonPoint,
  type StagePt,
} from "./drawPolygonDraft";

export interface ExploreCanvasProps {
  doc: ExploreDoc;
  onSelectHotspot: (id: string | null) => void;
  onCommitRect: (hotspotId: string, rect: Rect) => void;
  /** Commit polygon vertex edits (drag / insert / remove). */
  onCommitPolygonPoints: (hotspotId: string, points: [number, number][]) => void;
  onCreateRect: (rect: Rect, opts?: { keepDrawTool?: boolean }) => void;
  /** Point-by-point polygon draw (≥3 verts). Returns to select unless keepDrawTool. */
  onCreatePolygon: (
    points: [number, number][],
    opts?: { keepDrawTool?: boolean },
  ) => void;
  /** Esc / empty right-click cancel while drawing a polygon. */
  onCancelPolygonDraw?: () => void;
  /** Phase A context-menu actions (blank / rect / polygon). */
  onContextAction?: (action: CtxMenuActionId, target: CtxMenuTarget) => void;
  /** Logical stage size (default project resolution). */
  width?: number;
  height?: number;
}

type Drag =
  | { kind: "draw"; start: { x: number; y: number }; current: Rect }
  | {
      kind: "move";
      id: string;
      origin: Rect;
      last: { x: number; y: number };
      pointerStart: { clientX: number; clientY: number };
      active: boolean;
    }
  | {
      kind: "resize";
      id: string;
      handle: Handle;
      origin: Rect;
      pointerStart: { clientX: number; clientY: number };
      active: boolean;
    }
  | {
      kind: "vertex";
      id: string;
      index: number;
      /** Live preview points (mutated vertex at index). */
      points: [number, number][];
      pointerStart: { clientX: number; clientY: number };
      active: boolean;
    };

function stagePoint(
  el: HTMLElement,
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const x = Math.round(((clientX - r.left) / r.width) * width);
  const y = Math.round(((clientY - r.top) / r.height) * height);
  return { x, y };
}

/** Host media URL for scene.bg.asset, or null when unset / blank. */
export function exploreCanvasBgSrc(bg?: { asset: string } | null): string | null {
  const asset = bg?.asset?.trim() ?? "";
  if (!asset) return null;
  return mediaUrl(asset);
}

/** CSS inset % for a handle relative to its hotspot box (center of edge/corner). */
function handleInset(handle: Handle): { left: string; top: string } {
  switch (handle) {
    case "nw":
      return { left: "0%", top: "0%" };
    case "n":
      return { left: "50%", top: "0%" };
    case "ne":
      return { left: "100%", top: "0%" };
    case "e":
      return { left: "100%", top: "50%" };
    case "se":
      return { left: "100%", top: "100%" };
    case "s":
      return { left: "50%", top: "100%" };
    case "sw":
      return { left: "0%", top: "100%" };
    case "w":
      return { left: "0%", top: "50%" };
  }
}

/** Explore room canvas: draw / select / move / resize rects; edit polygon vertices. */
export function ExploreCanvas({
  doc,
  onSelectHotspot,
  onCommitRect,
  onCommitPolygonPoints,
  onCreateRect,
  onCreatePolygon,
  onCancelPolygonDraw,
  onContextAction,
  width = doc.project.resolution.width,
  height = doc.project.resolution.height,
}: ExploreCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<{
    id: string;
    index: number;
  } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    clientX: number;
    clientY: number;
    target: CtxMenuTarget;
  } | null>(null);
  // Synced ref so onCtxPick still has the target if close races ahead of pick.
  const ctxMenuRef = useRef(ctxMenu);
  ctxMenuRef.current = ctxMenu;
  /** In-progress point-by-point polygon (only while tool === drawPolygon). */
  const [polyDraft, setPolyDraft] = useState<StagePt[]>([]);
  const [polyCursor, setPolyCursor] = useState<{ x: number; y: number } | null>(
    null,
  );
  const polyDraftRef = useRef(polyDraft);
  polyDraftRef.current = polyDraft;
  const bgSrc = exploreCanvasBgSrc(doc.scene.bg);
  const [bgFailed, setBgFailed] = useState(false);
  useEffect(() => {
    setBgFailed(false);
  }, [bgSrc]);
  const selected = doc.ui.selectedHotspotId;
  const tool = doc.ui.canvasTool;

  // Clear vertex selection when hotspot selection changes.
  useEffect(() => {
    setSelectedVertex((v) => (v && v.id === selected ? v : null));
  }, [selected]);

  // Reset in-progress polygon when leaving the tool.
  useEffect(() => {
    if (tool !== "drawPolygon") {
      setPolyDraft([]);
      setPolyCursor(null);
    }
  }, [tool]);

  const finishPolygonDraft = useCallback(
    (raw: StagePt[], opts?: { keepDrawTool?: boolean }) => {
      const pts = finalizeDrawPolygonPoints(raw);
      if (!pts) return false;
      onCreatePolygon(pts, opts);
      setPolyDraft([]);
      setPolyCursor(null);
      return true;
    },
    [onCreatePolygon],
  );

  const cancelPolygonDraft = useCallback(() => {
    setPolyDraft([]);
    setPolyCursor(null);
    onCancelPolygonDraw?.();
  }, [onCancelPolygonDraw]);

  const commitRemoveVertex = useCallback(
    (hotspotId: string, index: number) => {
      const hs = doc.scene.hotspots.find((h) => h.id === hotspotId);
      if (!hs || !isPolygon(hs.shape)) return;
      const next = removePolygonVertex(hs.shape.points, index);
      if (!next) return;
      onCommitPolygonPoints(hotspotId, next);
      setSelectedVertex(null);
    },
    [doc.scene.hotspots, onCommitPolygonPoints],
  );

  // Draw-polygon: Enter finish / Esc cancel / Backspace undo last point.
  // Capture so Workspace Delete/nudge does not fight the draft.
  useEffect(() => {
    if (tool !== "drawPolygon") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inEditable =
        !!t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const action = drawPolygonKeyAction(e.key, {
        inEditableField: inEditable,
        pointCount: polyDraftRef.current.length,
      });
      if (!action) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (action === "cancel") {
        cancelPolygonDraft();
        return;
      }
      if (action === "undoPoint") {
        setPolyDraft((pts) => undoDrawPolygonPoint(pts));
        return;
      }
      if (action === "finish") {
        finishPolygonDraft(polyDraftRef.current, { keepDrawTool: e.shiftKey });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cancelPolygonDraft, finishPolygonDraft, tool]);

  // Delete / Backspace removes selected vertex (≥3 remain).
  // Capture + stopImmediatePropagation so Workspace hotspot-delete does not also fire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (tool === "drawPolygon") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      ) {
        return;
      }
      if (!selectedVertex) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      commitRemoveVertex(selectedVertex.id, selectedVertex.index);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [commitRemoveVertex, selectedVertex, tool]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Primary button only — ignore right / middle / pen eraser.
      if (e.button !== 0) return;
      const el = ref.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);
      const p = stagePoint(el, e.clientX, e.clientY, width, height);
      const displayW = el.getBoundingClientRect().width;
      const pad = handlePadStage(width, displayW);

      if (tool === "drawRect") {
        const rect = normalizeRect(p, p);
        setDrag({ kind: "draw", start: p, current: rect });
        onSelectHotspot(null);
        setSelectedVertex(null);
        return;
      }

      if (tool === "drawPolygon") {
        const [cx, cy] = clampPoint(p.x, p.y, { width, height });
        setPolyDraft((pts) => appendDrawPolygonPoint(pts, cx, cy));
        setPolyCursor({ x: cx, y: cy });
        onSelectHotspot(null);
        setSelectedVertex(null);
        setCtxMenu(null);
        return;
      }

      if (selected) {
        const hs = doc.scene.hotspots.find((h) => h.id === selected);
        if (hs && isPolygon(hs.shape)) {
          const vi = hitTestVertex(hs.shape.points, p.x, p.y, pad);
          if (vi !== null) {
            setSelectedVertex({ id: selected, index: vi });
            // Alt-click removes vertex when ≥4 points.
            if (e.altKey) {
              commitRemoveVertex(selected, vi);
              return;
            }
            setDrag({
              kind: "vertex",
              id: selected,
              index: vi,
              points: hs.shape.points.map(([x, y]) => [x, y] as [number, number]),
              pointerStart: { clientX: e.clientX, clientY: e.clientY },
              active: false,
            });
            return;
          }
          if (hitTestHotspots([hs], p.x, p.y) === selected) {
            setSelectedVertex(null);
            return;
          }
        }
        if (hs && isRect(hs.shape)) {
          const handle = hitTestHandle(hs.shape, p.x, p.y, pad);
          if (handle) {
            setSelectedVertex(null);
            setDrag({
              kind: "resize",
              id: selected,
              handle,
              origin: { ...hs.shape },
              pointerStart: { clientX: e.clientX, clientY: e.clientY },
              active: false,
            });
            return;
          }
          if (hitTestHotspots([hs], p.x, p.y) === selected) {
            setSelectedVertex(null);
            setDrag({
              kind: "move",
              id: selected,
              origin: { ...hs.shape },
              last: p,
              pointerStart: { clientX: e.clientX, clientY: e.clientY },
              active: false,
            });
            return;
          }
        }
      }

      const hit = hitTestHotspots(doc.scene.hotspots, p.x, p.y);
      onSelectHotspot(hit);
      setSelectedVertex(null);
      if (hit) {
        const hs = doc.scene.hotspots.find((h) => h.id === hit);
        if (hs && isRect(hs.shape)) {
          setDrag({
            kind: "move",
            id: hit,
            origin: { ...hs.shape },
            last: p,
            pointerStart: { clientX: e.clientX, clientY: e.clientY },
            active: false,
          });
        }
      }
    },
    [
      commitRemoveVertex,
      doc.scene.hotspots,
      height,
      onSelectHotspot,
      selected,
      tool,
      width,
    ],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!ref.current) return;
      const p = stagePoint(ref.current, e.clientX, e.clientY, width, height);
      if (tool === "drawPolygon") {
        const [cx, cy] = clampPoint(p.x, p.y, { width, height });
        setPolyCursor({ x: cx, y: cy });
      }
      if (!drag) return;
      if (drag.kind === "draw") {
        setDrag({
          ...drag,
          current: clampRect(normalizeRect(drag.start, p), { width, height }),
        });
      } else if (drag.kind === "move") {
        const client = { clientX: e.clientX, clientY: e.clientY };
        if (!drag.active && !pastDragThreshold(drag.pointerStart, client)) return;
        const dx = p.x - drag.last.x;
        const dy = p.y - drag.last.y;
        setDrag({
          ...drag,
          active: true,
          last: p,
          origin: clampRect(moveRect(drag.origin, dx, dy), { width, height }),
        });
      } else if (drag.kind === "resize") {
        const client = { clientX: e.clientX, clientY: e.clientY };
        if (!drag.active && !pastDragThreshold(drag.pointerStart, client)) return;
        setDrag({
          ...drag,
          active: true,
          origin: clampRect(resizeRect(drag.origin, drag.handle, p.x, p.y), {
            width,
            height,
          }),
        });
      } else if (drag.kind === "vertex") {
        const client = { clientX: e.clientX, clientY: e.clientY };
        if (!drag.active && !pastDragThreshold(drag.pointerStart, client)) return;
        const [cx, cy] = clampPoint(p.x, p.y, { width, height });
        setDrag({
          ...drag,
          active: true,
          points: setPolygonVertex(drag.points, drag.index, cx, cy),
        });
      }
    },
    [drag, height, tool, width],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return;
      if (drag.kind === "draw") {
        if (drag.current.w >= 8 && drag.current.h >= 8) {
          onCreateRect(drag.current, { keepDrawTool: e.shiftKey });
        }
      } else if (drag.kind === "move" || drag.kind === "resize") {
        // Below threshold: treat as click — no commit / no dirty.
        if (!drag.active) {
          setDrag(null);
          return;
        }
        const hs = doc.scene.hotspots.find((h) => h.id === drag.id);
        const same =
          hs &&
          isRect(hs.shape) &&
          hs.shape.x === drag.origin.x &&
          hs.shape.y === drag.origin.y &&
          hs.shape.w === drag.origin.w &&
          hs.shape.h === drag.origin.h;
        if (!same) onCommitRect(drag.id, drag.origin);
      } else if (drag.kind === "vertex") {
        if (!drag.active) {
          setDrag(null);
          return;
        }
        const hs = doc.scene.hotspots.find((h) => h.id === drag.id);
        const same =
          hs && isPolygon(hs.shape) && pointsEqual(hs.shape.points, drag.points);
        if (!same) onCommitPolygonPoints(drag.id, drag.points);
      }
      setDrag(null);
    },
    [drag, doc.scene.hotspots, onCommitPolygonPoints, onCommitRect, onCreateRect],
  );

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = ref.current;
      if (!el) return;
      setDrag(null);
      // While drawing a polygon: right-click undoes last point; empty → cancel.
      if (tool === "drawPolygon") {
        setCtxMenu(null);
        if (polyDraftRef.current.length > 0) {
          setPolyDraft((pts) => undoDrawPolygonPoint(pts));
        } else {
          cancelPolygonDraft();
        }
        return;
      }
      const p = stagePoint(el, e.clientX, e.clientY, width, height);
      const hit = hitTestHotspots(doc.scene.hotspots, p.x, p.y);
      const target = canvasContextMenuTarget(doc.scene.hotspots, p.x, p.y, hit);
      if (target.kind !== "blank") {
        onSelectHotspot(target.hotspotId);
      }
      setSelectedVertex(null);
      setCtxMenu({ clientX: e.clientX, clientY: e.clientY, target });
    },
    [cancelPolygonDraft, doc.scene.hotspots, height, onSelectHotspot, tool, width],
  );

  const onCtxPick = useCallback(
    (action: CtxMenuActionId) => {
      const open = ctxMenuRef.current;
      setCtxMenu(null);
      if (!open) return;
      if (action === "cancel") return;
      onContextAction?.(action, open.target);
    },
    [onContextAction],
  );

  /** Double-click: finish point-by-point polygon, or insert vertex on edge. */
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const el = ref.current;
      if (!el || tool === "drawRect") return;
      if (tool === "drawPolygon") {
        e.preventDefault();
        // Second click of dblclick already appended via pointerdown.
        finishPolygonDraft(polyDraftRef.current, { keepDrawTool: e.shiftKey });
        return;
      }
      const p = stagePoint(el, e.clientX, e.clientY, width, height);
      const displayW = el.getBoundingClientRect().width;
      const pad = handlePadStage(width, displayW);
      const id = selected ?? hitTestHotspots(doc.scene.hotspots, p.x, p.y);
      if (!id) return;
      const hs = doc.scene.hotspots.find((h) => h.id === id);
      if (!hs || !isPolygon(hs.shape)) return;
      // Prefer selected polygon; still require near an edge.
      const edge = hitTestPolygonEdge(hs.shape.points, p.x, p.y, pad * 1.5);
      if (!edge) return;
      e.preventDefault();
      const [qx, qy] = clampPoint(edge.qx, edge.qy, { width, height });
      const next = insertPolygonVertex(hs.shape.points, edge.edgeIndex, qx, qy);
      onSelectHotspot(id);
      onCommitPolygonPoints(id, next);
      setSelectedVertex({ id, index: edge.edgeIndex + 1 });
    },
    [
      doc.scene.hotspots,
      finishPolygonDraft,
      height,
      onCommitPolygonPoints,
      onSelectHotspot,
      selected,
      tool,
      width,
    ],
  );

  const previewRect = (id: string, shape: Rect): Rect => {
    if (
      drag &&
      (drag.kind === "move" || drag.kind === "resize") &&
      drag.active &&
      drag.id === id
    ) {
      return drag.origin;
    }
    return shape;
  };

  const previewPolyPoints = (
    id: string,
    points: [number, number][],
  ): [number, number][] => {
    if (drag && drag.kind === "vertex" && drag.active && drag.id === id) {
      return drag.points;
    }
    return points;
  };

  const handlePx = HANDLE_SCREEN_PX;

  return (
    <div
      ref={ref}
      className="explore-canvas"
      data-testid="explore-canvas"
      tabIndex={0}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${width} / ${height}`,
        background: "#1a1d24",
        border: "1px solid #333",
        overflow: "hidden",
        touchAction: "none",
        cursor:
          tool === "drawRect" || tool === "drawPolygon" ? "crosshair" : "default",
        outline: "none",
      }}
      onPointerDown={(e) => {
        ref.current?.focus({ preventScroll: true });
        onPointerDown(e);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      {bgSrc && !bgFailed ? (
        <img
          data-testid="explore-canvas-bg"
          src={bgSrc}
          alt=""
          draggable={false}
          onError={() => setBgFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "fill",
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      ) : null}
      {bgSrc && bgFailed ? (
        <div
          data-testid="explore-canvas-bg-missing"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            background: "rgba(26, 29, 36, 0.92)",
            color: "#fc8",
            fontSize: 13,
            textAlign: "center",
            padding: 12,
          }}
        >
          找不到背景：{doc.scene.bg?.asset?.trim() || "（未命名）"}
        </div>
      ) : null}
      {doc.scene.hotspots.map((h) => {
        if (isPolygon(h.shape)) {
          const sel = selected === h.id;
          const pts = previewPolyPoints(h.id, h.shape.points);
          const bounds = polygonBounds(pts);
          return (
            <Fragment key={h.id}>
              <svg
                data-testid={`hotspot-poly-${h.id}`}
                data-selected={sel ? "1" : "0"}
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  overflow: "visible",
                }}
              >
                <title>{`${h.name}（多邊形）`}</title>
                <polygon
                  points={polygonSvgPoints(pts)}
                  fill={sel ? "rgba(80,180,255,0.25)" : "rgba(60,160,120,0.18)"}
                  stroke={sel ? "#6cf" : "#4a8"}
                  strokeWidth={sel ? Math.max(2, width / 400) : Math.max(1, width / 600)}
                  vectorEffect="non-scaling-stroke"
                />
                {bounds ? (
                  <text
                    x={bounds.x + 4}
                    y={bounds.y + 14}
                    fill="#dff"
                    fontSize={Math.max(12, width / 100)}
                    style={{ textShadow: "0 1px 2px #000" }}
                  >
                    {h.name}
                  </text>
                ) : null}
              </svg>
              {sel
                ? pts.map(([vx, vy], i) => {
                    const vertSel =
                      selectedVertex?.id === h.id && selectedVertex.index === i;
                    return (
                      <div
                        key={i}
                        data-testid={vertexHandleTestId(h.id, i)}
                        data-vertex={i}
                        data-selected={vertSel ? "1" : "0"}
                        style={{
                          position: "absolute",
                          left: `${(vx / width) * 100}%`,
                          top: `${(vy / height) * 100}%`,
                          width: handlePx,
                          height: handlePx,
                          marginLeft: -handlePx / 2,
                          marginTop: -handlePx / 2,
                          background: vertSel ? "#fc6" : "#6cf",
                          border: "1px solid #fff",
                          boxSizing: "border-box",
                          boxShadow: "0 0 2px #000",
                          borderRadius: 1,
                          pointerEvents: "none",
                          zIndex: 2,
                        }}
                      />
                    );
                  })
                : null}
            </Fragment>
          );
        }
        if (!isRect(h.shape)) {
          return (
            <div
              key={h.id}
              data-testid={`hotspot-unknown-${h.id}`}
              style={{ position: "absolute", left: 0, top: 0, fontSize: 11, color: "#888" }}
            />
          );
        }
        const r = previewRect(h.id, h.shape);
        const sel = selected === h.id;
        return (
          <div
            key={h.id}
            data-testid={`hotspot-${h.id}`}
            data-selected={sel ? "1" : "0"}
            style={{
              position: "absolute",
              left: `${(r.x / width) * 100}%`,
              top: `${(r.y / height) * 100}%`,
              width: `${(r.w / width) * 100}%`,
              height: `${(r.h / height) * 100}%`,
              border: sel ? "2px solid #6cf" : "1px solid #4a8",
              background: sel ? "rgba(80,180,255,0.25)" : "rgba(60,160,120,0.18)",
              boxSizing: "border-box",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 2,
                top: 2,
                fontSize: 11,
                color: "#dff",
                textShadow: "0 1px 2px #000",
              }}
            >
              {h.name}
            </span>
            {sel
              ? HANDLES.map((handle) => {
                  const inset = handleInset(handle);
                  return (
                    <div
                      key={handle}
                      data-testid={resizeHandleTestId(h.id, handle)}
                      data-handle={handle}
                      style={{
                        position: "absolute",
                        left: inset.left,
                        top: inset.top,
                        width: handlePx,
                        height: handlePx,
                        marginLeft: -handlePx / 2,
                        marginTop: -handlePx / 2,
                        background: "#6cf",
                        border: "1px solid #fff",
                        boxSizing: "border-box",
                        boxShadow: "0 0 2px #000",
                        pointerEvents: "none",
                        zIndex: 2,
                      }}
                    />
                  );
                })
              : null}
          </div>
        );
      })}
      {drag?.kind === "draw" ? (
        <div
          data-testid="draw-preview"
          style={{
            position: "absolute",
            left: `${(drag.current.x / width) * 100}%`,
            top: `${(drag.current.y / height) * 100}%`,
            width: `${(drag.current.w / width) * 100}%`,
            height: `${(drag.current.h / height) * 100}%`,
            border: "1px dashed #6cf",
            background: "rgba(80,180,255,0.15)",
            pointerEvents: "none",
          }}
        />
      ) : null}
      {tool === "drawPolygon" && (polyDraft.length > 0 || polyCursor) ? (
        <svg
          data-testid="draw-polygon-preview"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          {(() => {
            const geo = drawPolygonPreviewGeometry(polyDraft, polyCursor);
            const sw = Math.max(1.5, width / 500);
            return (
              <>
                {geo.closedFill ? (
                  <polygon
                    points={geo.closedFill}
                    fill="rgba(80,180,255,0.12)"
                    stroke="none"
                  />
                ) : null}
                {geo.polyline ? (
                  <polyline
                    points={geo.polyline}
                    fill="none"
                    stroke="#6cf"
                    strokeWidth={sw}
                    strokeDasharray={`${sw * 4} ${sw * 3}`}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {geo.closeEdge ? (
                  <line
                    x1={geo.closeEdge.x1}
                    y1={geo.closeEdge.y1}
                    x2={geo.closeEdge.x2}
                    y2={geo.closeEdge.y2}
                    stroke="#6cf"
                    strokeWidth={sw}
                    strokeOpacity={0.55}
                    strokeDasharray={`${sw * 2} ${sw * 2}`}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {polyDraft.map(([vx, vy], i) => (
                  <circle
                    key={i}
                    cx={vx}
                    cy={vy}
                    r={Math.max(3, width / 250)}
                    fill={i === 0 ? "#fc6" : "#6cf"}
                    stroke="#fff"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </>
            );
          })()}
        </svg>
      ) : null}
      {ctxMenu ? (
        <CanvasContextMenu
          x={ctxMenu.clientX}
          y={ctxMenu.clientY}
          items={canvasContextMenuItems(ctxMenu.target)}
          onPick={onCtxPick}
          onClose={closeCtxMenu}
        />
      ) : null}
    </div>
  );
}
