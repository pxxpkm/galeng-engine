import { useEffect, useRef } from "react";
import { hashRgb } from "./hash";
import { charLogical, fitBottomCenter, mediaUrl } from "./media";
import { previewState } from "./previewState";
import type { Beat } from "./types";

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function slotBox(slot: "left" | "center" | "right"): [number, number, number, number] {
  if (slot === "left") {
    return [360, 200, 520, 880];
  }
  if (slot === "right") {
    return [1040, 200, 520, 880];
  }
  return [700, 160, 520, 920];
}

function canvasLogical(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 1920,
    y: ((clientY - rect.top) / rect.height) * 1080,
  };
}

function uncam(
  px: number,
  py: number,
  cam: { x: number; y: number; zoom: number },
): { x: number; y: number } {
  const z = cam.zoom / 100;
  return {
    x: (px - 960 - cam.x) / z + 960,
    y: (py - 540 - cam.y) / z + 540,
  };
}

export function Preview({
  sceneId,
  beats,
  beatIndex,
  msgBox,
  onCharOffset,
}: {
  sceneId: string;
  beats: Beat[];
  beatIndex: number;
  msgBox?: string;
  onCharOffset?: (index: number, x: number, y: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{
    index: number;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const snap = previewState(sceneId, beats, beatIndex);
    let cancelled = false;
    const w = canvas.width;
    const h = canvas.height;
    const sx = w / 1920;
    const sy = h / 1080;

    (async () => {
      const bgImg = snap.bg ? await loadImage(mediaUrl(snap.bg)) : null;
      const charImgs = await Promise.all(
        snap.chars.map((ch) => loadImage(mediaUrl(charLogical(ch.id, ch.face)))),
      );
      const cgImg = snap.cg ? await loadImage(mediaUrl(snap.cg)) : null;
      const boxImg = msgBox ? await loadImage(mediaUrl(msgBox)) : null;
      if (cancelled || !ctx) return;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      const cam = snap.camera ?? { x: 0, y: 0, zoom: 100 };
      ctx.save();
      ctx.translate(w / 2 + cam.x * sx, h / 2 + cam.y * sy);
      ctx.scale(cam.zoom / 100, cam.zoom / 100);
      ctx.translate(-w / 2, -h / 2);
      if (snap.bg) {
        if (bgImg) {
          ctx.drawImage(bgImg, 0, 0, w, h);
        } else {
          ctx.fillStyle = hashRgb(snap.bg);
          ctx.fillRect(0, 0, w, h);
        }
      }
      snap.chars.forEach((ch, i) => {
        const box = slotBox(ch.slot);
        const ox = ch.x ?? 0;
        const oy = ch.y ?? 0;
        const img = charImgs[i];
        if (img) {
          const fit = fitBottomCenter(img.naturalWidth, img.naturalHeight, box[0], box[1], box[2], box[3]);
          ctx.drawImage(img, (fit.x + ox) * sx, (fit.y + oy) * sy, fit.w * sx, fit.h * sy);
        } else {
          ctx.fillStyle = hashRgb(`${ch.id}:${ch.face}`);
          ctx.fillRect((box[0] + ox) * sx, (box[1] + oy) * sy, box[2] * sx, box[3] * sy);
        }
      });
      if (snap.cg) {
        if (cgImg) {
          ctx.drawImage(cgImg, 0, 0, w, h);
        } else {
          ctx.fillStyle = hashRgb(snap.cg);
          ctx.fillRect(0, 0, w, h);
        }
      }
      ctx.restore();
      if (snap.sayText) {
        if (boxImg) {
          ctx.drawImage(boxImg, 80 * sx, 780 * sy, 1760 * sx, 260 * sy);
        } else {
          ctx.fillStyle = "rgba(8,8,16,0.82)";
          ctx.fillRect(80 * sx, 780 * sy, 1760 * sx, 260 * sy);
        }
        ctx.fillStyle = "#ffdc8c";
        ctx.font = `${Math.max(14, 28 * sy)}px sans-serif`;
        ctx.fillText(snap.saySpeaker ?? "", 112 * sx, 830 * sy);
        ctx.fillStyle = "#fff";
        ctx.font = `${Math.max(16, 36 * sy)}px sans-serif`;
        ctx.fillText(snap.sayText, 112 * sx, 900 * sy);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sceneId, beats, beatIndex, msgBox]);

  return (
    <canvas
      ref={ref}
      width={1920}
      height={1080}
      className="preview-canvas"
      style={onCharOffset ? { cursor: "grab" } : undefined}
      onPointerDown={(event) => {
        if (!onCharOffset || event.button !== 0) {
          return;
        }
        const canvas = ref.current;
        if (!canvas) {
          return;
        }
        const snap = previewState(sceneId, beats, beatIndex);
        const cam = snap.camera ?? { x: 0, y: 0, zoom: 100 };
        const logical = uncam(canvasLogical(canvas, event.clientX, event.clientY).x, canvasLogical(canvas, event.clientX, event.clientY).y, cam);
        for (let i = snap.chars.length - 1; i >= 0; i--) {
          const ch = snap.chars[i]!;
          const box = slotBox(ch.slot);
          const x = box[0] + (ch.x ?? 0);
          const y = box[1] + (ch.y ?? 0);
          if (logical.x >= x && logical.x <= x + box[2] && logical.y >= y && logical.y <= y + box[3]) {
            drag.current = {
              index: i,
              originX: logical.x,
              originY: logical.y,
              startX: ch.x ?? 0,
              startY: ch.y ?? 0,
            };
            canvas.setPointerCapture(event.pointerId);
            return;
          }
        }
      }}
      onPointerMove={(event) => {
        if (!onCharOffset || !drag.current) {
          return;
        }
        const canvas = ref.current;
        if (!canvas) {
          return;
        }
        const snap = previewState(sceneId, beats, beatIndex);
        const cam = snap.camera ?? { x: 0, y: 0, zoom: 100 };
        const p = canvasLogical(canvas, event.clientX, event.clientY);
        const logical = uncam(p.x, p.y, cam);
        const next = drag.current;
        onCharOffset(
          next.index,
          next.startX + (logical.x - next.originX),
          next.startY + (logical.y - next.originY),
        );
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    />
  );
}
