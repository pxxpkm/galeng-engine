import { useMemo, useState } from "react";
import {
  PRESET_CATALOG,
  type ExplorePreset,
  type PresetCategory,
} from "./presets";

const CATEGORIES: { id: PresetCategory; label: string }[] = [
  { id: "transition", label: "轉場" },
  { id: "hotspot", label: "熱區巨集" },
  { id: "action", label: "動作" },
];

export interface PresetBrowserProps {
  onApply: (presetId: string) => void;
  /** Disable apply when context missing (e.g. no hotspot). */
  canApply?: (preset: ExplorePreset) => boolean;
}

export function PresetBrowser({ onApply, canApply }: PresetBrowserProps) {
  const [cat, setCat] = useState<PresetCategory>("hotspot");
  const list = useMemo(
    () => PRESET_CATALOG.filter((p) => p.category === cat),
    [cat],
  );

  return (
    <div data-testid="preset-browser" style={{ fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Preset Browser</div>
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            data-testid={`preset-cat-${c.id}`}
            data-active={cat === c.id ? "1" : "0"}
            onClick={() => setCat(c.id)}
            style={{
              background: cat === c.id ? "#234" : "transparent",
              border: "1px solid #445",
              color: "inherit",
              padding: "2px 8px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {list.map((p) => {
          const ok = canApply ? canApply(p) : true;
          return (
            <li
              key={p.id}
              data-testid={`preset-row-${p.id}`}
              style={{
                border: "1px solid #333",
                borderRadius: 6,
                padding: 8,
                marginBottom: 6,
                background: "#1a1e28",
              }}
            >
              <div style={{ fontWeight: 600 }}>{p.label}</div>
              <div style={{ opacity: 0.75, margin: "4px 0 6px" }}>{p.description}</div>
              <button
                type="button"
                data-testid={`preset-apply-${p.id}`}
                disabled={!ok}
                title={ok ? "套用（單次 Undo）" : "需要選取熱區／矩陣格"}
                onClick={() => onApply(p.id)}
              >
                套用
              </button>
            </li>
          );
        })}
      </ul>
      {list.length === 0 ? (
        <div style={{ opacity: 0.6 }}>此分類暫無 Preset</div>
      ) : null}
    </div>
  );
}
