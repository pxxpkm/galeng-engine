import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { CtxMenuItem } from "./ctxMenuModel";

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
  const pickedRef = useRef(false);

  useEffect(() => {
    pickedRef.current = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    // Outside dismiss on pointerdown (capture). Contains check keeps menu clicks alive.
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    // Delay one tick so the opening contextmenu gesture does not immediately dismiss.
    const t = window.setTimeout(() => {
      window.addEventListener("pointerdown", onDown, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  const pick = (id: CtxMenuItem["id"]) => {
    if (pickedRef.current) return;
    pickedRef.current = true;
    onPick(id);
  };

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
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          data-testid={`ctx-menu-${item.id}`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            pick(item.id);
          }}
          onClick={(e) => {
            // Keyboard activation (Enter/Space) and environments that only fire click.
            e.preventDefault();
            e.stopPropagation();
            pick(item.id);
          }}
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
