import type { ExploreDoc } from "./types";

export interface HierarchyPanelProps {
  doc: ExploreDoc;
  onSelectHotspot: (id: string | null) => void;
}

/** Minimal left Hierarchy: scene + hotspot list (select / highlight). */
export function HierarchyPanel({ doc, onSelectHotspot }: HierarchyPanelProps) {
  const sel = doc.ui.selectedHotspotId;
  return (
    <div
      className="hierarchy-panel"
      data-testid="hierarchy-panel"
      style={{ fontSize: 12, borderRight: "1px solid #333", paddingRight: 8 }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        場景：{doc.scene.title ?? doc.scene.id}
      </div>
      <div style={{ opacity: 0.7, marginBottom: 4 }}>熱區</div>
      {doc.scene.hotspots.length === 0 ? (
        <div style={{ opacity: 0.55 }} data-testid="hierarchy-empty">
          （未有熱區 — 喺畫布畫一個）
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {doc.scene.hotspots.map((h) => {
            const active = sel === h.id;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  data-testid={`hierarchy-hs-${h.id}`}
                  data-selected={active ? "1" : "0"}
                  onClick={() => onSelectHotspot(h.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "4px 6px",
                    marginBottom: 2,
                    background: active ? "#234" : "transparent",
                    border: active ? "1px solid #6cf" : "1px solid transparent",
                    color: "inherit",
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                >
                  {h.name || h.id}
                  <span style={{ opacity: 0.45, marginLeft: 6 }}>{h.id}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
