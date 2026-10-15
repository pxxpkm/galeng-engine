import { AssetField } from "../AssetField";
import type { ExploreDoc, SceneCatalogEntry } from "./types";

/** Minimal i18n for AssetField inside Explore (書面語). */
function exploreAssetT(key: string): string {
  if (key === "editor.assetMissing") return "找不到此資產（不在媒體清單）";
  if (key === "editor.audition") return "試聽";
  if (key === "editor.auditionStop") return "停止";
  return key;
}


export interface HierarchyPanelProps {
  doc: ExploreDoc;
  onSelectHotspot: (id: string | null) => void;
  /** Project scene catalog for startScene dropdown (L3). */
  sceneCatalog?: SceneCatalogEntry[];
  /** Patch scene title / bg via updateScene. */
  onUpdateScene?: (
    patch: { title?: string; bg?: ExploreDoc["scene"]["bg"] },
    coalesceKey?: string,
  ) => void;
  /** Patch project title / startScene via updateProject. */
  onUpdateProject?: (
    patch: { title?: string; startScene?: string },
    coalesceKey?: string,
  ) => void;
  /** Host /api/assets bg/* logicals for AssetField datalist. */
  bgAssetOptions?: string[];
}

/** Left Hierarchy: scene/project meta (editable) + hotspot list. */
export function HierarchyPanel({
  doc,
  onSelectHotspot,
  sceneCatalog = [],
  onUpdateScene,
  onUpdateProject,
  bgAssetOptions = [],
}: HierarchyPanelProps) {
  const sel = doc.scene.hotspots;
  const selected = doc.ui.selectedHotspotId;
  const bgAsset = doc.scene.bg?.asset ?? "";
  const canEditScene = !!onUpdateScene;
  const canEditProject = !!onUpdateProject;
  const startScene = doc.project.startScene;
  const useStartSelect = sceneCatalog.length > 0;
  const startKnown = sceneCatalog.some((s) => s.id === startScene);

  return (
    <div
      className="hierarchy-panel"
      data-testid="hierarchy-panel"
      style={{ fontSize: 12, borderRight: "1px solid #333", paddingRight: 8 }}
    >
      <div
        data-testid="hierarchy-project-meta"
        style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #333" }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>專案</div>
        <label style={{ display: "block", marginBottom: 4 }}>
          標題
          <input
            data-testid="hierarchy-project-title"
            style={{ width: "100%", display: "block", boxSizing: "border-box" }}
            value={doc.project.title}
            disabled={!canEditProject}
            onChange={(e) =>
              onUpdateProject?.({ title: e.target.value }, "project-title")
            }
          />
        </label>
        <label style={{ display: "block", marginBottom: 4 }}>
          起始場景
          {useStartSelect ? (
            <select
              data-testid="hierarchy-start-scene"
              style={{ width: "100%", display: "block", boxSizing: "border-box" }}
              value={startScene}
              disabled={!canEditProject}
              onChange={(e) =>
                onUpdateProject?.(
                  { startScene: e.target.value },
                  "project-startScene",
                )
              }
            >
              <option value="">（選擇起始場景）</option>
              {sceneCatalog.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title ? `${s.title} (${s.id})` : s.id}
                  {s.kind === "dialogue" ? " ·對話" : " ·探險"}
                </option>
              ))}
              {startScene && !startKnown ? (
                <option value={startScene}>{startScene}（未知）</option>
              ) : null}
            </select>
          ) : (
            <input
              data-testid="hierarchy-start-scene"
              style={{ width: "100%", display: "block", boxSizing: "border-box" }}
              value={startScene}
              disabled={!canEditProject}
              onChange={(e) =>
                onUpdateProject?.(
                  { startScene: e.target.value },
                  "project-startScene",
                )
              }
            />
          )}
        </label>
      </div>

      <div
        data-testid="hierarchy-scene-meta"
        style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #333" }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          場景
          <span style={{ opacity: 0.45, fontWeight: 400, marginLeft: 6 }}>
            {doc.scene.id}
          </span>
        </div>
        <label style={{ display: "block", marginBottom: 4 }}>
          標題
          <input
            data-testid="hierarchy-scene-title"
            style={{ width: "100%", display: "block", boxSizing: "border-box" }}
            value={doc.scene.title ?? ""}
            disabled={!canEditScene}
            onChange={(e) =>
              onUpdateScene?.({ title: e.target.value }, "scene-title")
            }
          />
        </label>
        <div style={{ marginBottom: 4 }}>
          <div style={{ marginBottom: 2 }}>背景</div>
          <AssetField
            value={bgAsset}
            options={bgAssetOptions}
            t={exploreAssetT}
            placeholder="bg/room"
            disabled={!canEditScene}
            inputTestId="hierarchy-scene-bg-asset"
            onChange={(asset) => {
              const prev = doc.scene.bg;
              if (!asset.trim()) {
                onUpdateScene?.({ bg: undefined }, "scene-bg-asset");
                return;
              }
              onUpdateScene?.(
                {
                  bg: {
                    asset,
                    ...(prev?.trans !== undefined ? { trans: prev.trans } : {}),
                    ...(prev?.ms !== undefined ? { ms: prev.ms } : {}),
                  },
                },
                "scene-bg-asset",
              );
            }}
          />
          {doc.scene.bg && (doc.scene.bg.trans !== undefined || doc.scene.bg.ms !== undefined) ? (
            <div style={{ opacity: 0.55, fontSize: 11, marginTop: 2 }}>
              轉場／毫秒已保留
              {doc.scene.bg.trans !== undefined ? ` · ${doc.scene.bg.trans}` : ""}
              {doc.scene.bg.ms !== undefined ? ` · ${doc.scene.bg.ms}ms` : ""}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ opacity: 0.7, marginBottom: 4 }}>熱區</div>
      {sel.length === 0 ? (
        <div style={{ opacity: 0.55 }} data-testid="hierarchy-empty">
          （尚無熱區 — 請在畫布繪製）
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {sel.map((h) => {
            const active = selected === h.id;
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
