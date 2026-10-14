import { useCallback, useEffect, useRef, useState } from "react";
import { mediaUrl } from "../media";
import {
  clampRect,
  hitTestHandle,
  hitTestHotspots,
  isRect,
  moveRect,
  normalizeRect,
  resizeRect,
  type Handle,
  type Rect,
} from "./canvas";
import type { ExploreDoc } from "./types";

export interface ExploreCanvasProps {
  doc: ExploreDoc;
  onSelectHotspot: (id: string | null) => void;
  onCommitRect: (hotspotId: string, rect: Rect) => void;
  onCreateRect: (rect: Rect) => void;
  /** Logical stage size (default project resolution). */
  width?: number;
  height?: number;
}

type Drag =
  | { kind: "draw"; start: { x: number; y: number }; current: Rect }
  | { kind: "move"; id: string; origin: Rect; last: { x: number; y: number } }
  | { kind: "resize"; id: string; handle: Handle; origin: Rect };

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

/** Minimal Explore room canvas: draw / select / move / resize rect hotspots. */
export function ExploreCanvas({
  doc,
  onSelectHotspot,
  onCommitRect,
  onCreateRect,
  width = doc.project.resolution.width,
  height = doc.project.resolution.height,
}: ExploreCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const bgSrc = exploreCanvasBgSrc(doc.scene.bg);
  const [bgFailed, setBgFailed] = useState(false);
  useEffect(() => {
    setBgFailed(false);
  }, [bgSrc]);
  const selected = doc.ui.selectedHotspotId;
  const tool = doc.ui.canvasTool;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);
      const p = stagePoint(el, e.clientX, e.clientY, width, height);

      if (tool === "drawRect") {
        const rect = normalizeRect(p, p);
        setDrag({ kind: "draw", start: p, current: rect });
        onSelectHotspot(null);
        return;
      }

      if (selected) {
        const hs = doc.scene.hotspots.find((h) => h.id === selected);
        if (hs && isRect(hs.shape)) {
          const handle = hitTestHandle(hs.shape, p.x, p.y);
          if (handle) {
            setDrag({ kind: "resize", id: selected, handle, origin: { ...hs.shape } });
            return;
          }
          if (hitTestHotspots([hs], p.x, p.y) === selected) {
            setDrag({ kind: "move", id: selected, origin: { ...hs.shape }, last: p });
            return;
          }
        }
      }

      const hit = hitTestHotspots(doc.scene.hotspots, p.x, p.y);
      onSelectHotspot(hit);
      if (hit) {
        const hs = doc.scene.hotspots.find((h) => h.id === hit);
        if (hs && isRect(hs.shape)) {
          setDrag({ kind: "move", id: hit, origin: { ...hs.shape }, last: p });
        }
      }
    },
    [doc.scene.hotspots, height, onSelectHotspot, selected, tool, width],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag || !ref.current) return;
      const p = stagePoint(ref.current, e.clientX, e.clientY, width, height);
      if (drag.kind === "draw") {
        setDrag({
          ...drag,
          current: clampRect(normalizeRect(drag.start, p), { width, height }),
        });
      } else if (drag.kind === "move") {
        const dx = p.x - drag.last.x;
        const dy = p.y - drag.last.y;
        setDrag({
          ...drag,
          last: p,
          origin: clampRect(moveRect(drag.origin, dx, dy), { width, height }),
        });
      } else if (drag.kind === "resize") {
        setDrag({
          ...drag,
          origin: clampRect(resizeRect(drag.origin, drag.handle, p.x, p.y), {
            width,
            height,
          }),
        });
      }
    },
    [drag, height, width],
  );

  const onPointerUp = useCallback(() => {
    if (!drag) return;
    if (drag.kind === "draw") {
      if (drag.current.w >= 8 && drag.current.h >= 8) onCreateRect(drag.current);
    } else if (drag.kind === "move" || drag.kind === "resize") {
      const hs = doc.scene.hotspots.find((h) => h.id === drag.id);
      const same =
        hs &&
        isRect(hs.shape) &&
        hs.shape.x === drag.origin.x &&
        hs.shape.y === drag.origin.y &&
        hs.shape.w === drag.origin.w &&
        hs.shape.h === drag.origin.h;
      if (!same) onCommitRect(drag.id, drag.origin);
    }
    setDrag(null);
  }, [drag, doc.scene.hotspots, onCommitRect, onCreateRect]);

  const previewRect = (id: string, shape: Rect): Rect => {
    if (drag && (drag.kind === "move" || drag.kind === "resize") && drag.id === id) {
      return drag.origin;
    }
    return shape;
  };

  return (
    <div
      ref={ref}
      className="explore-canvas"
      data-testid="explore-canvas"
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${width} / ${height}`,
        background: "#1a1d24",
        border: "1px solid #333",
        overflow: "hidden",
        touchAction: "none",
        cursor: tool === "drawRect" ? "crosshair" : "default",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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
      {doc.scene.hotspots.map((h) => {
        if (!isRect(h.shape)) {
          return (
            <div
              key={h.id}
              data-testid={`hotspot-poly-${h.id}`}
              title={`${h.name} (polygon — edit later)`}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                fontSize: 11,
                color: "#888",
                padding: 4,
              }}
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
    </div>
  );
}
