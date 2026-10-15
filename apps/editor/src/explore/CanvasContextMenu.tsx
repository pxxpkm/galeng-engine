import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { CtxMenuItem } from "./canvasContextMenu";

export interface CanvasContextMenuProps {
  x: number;
  y: number;
  items: CtxMenuItem[];
  onPick: (id: CtxMenuItem["id"]) => void;
  onClose: () => void;
}

/** Fixed-position floating menu for ExploreCanvas right-click. */
export function CanvasContextMenu({ x, y, items, onPick, onClose }: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    // capture so we close before canvas handlers; delay mousedown one tick after open
    const t = window.setTimeout(() => {
      window.addEventListener("mousedown", onDown, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [onClose]);

  // Keep menu on-screen roughly
  const pad = 8;
  const approxW = 220;
  const approxH = items.length * 32 + 8;
  const left = Math.max(
    pad,
    Math.min(x, (typeof window !== "undefined" ? window.innerWidth : x + approxW) - approxW - pad),
  );
  const top = Math.max(
    pad,
    Math.min(y, (typeof window !== "undefined" ? window.innerHeight : y + approxH) - approxH - pad),
  );

  return createPortal(
    <div
      ref={ref}
      data-testid="canvas-context-menu"
      role="menu"
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 10000,
        minWidth: 180,
        background: "#1e2430",
        border: "1px solid #556",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        padding: 4,
        color: "#e8e8e8",
        fontSize: 13,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          data-testid={`ctx-menu-${item.id}`}
          onClick={() => onPick(item.id)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "6px 10px",
            border: "none",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
            borderRadius: 4,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#2a3548";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
