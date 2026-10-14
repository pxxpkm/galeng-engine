import { useCallback, useEffect, useMemo, useState } from "react";
import type { Rect } from "./canvas";
import {
  canRedo,
  canUndo,
  dispatch,
  emptyBus,
  patchUi,
  redo,
  undo,
  type Command,
  type CommandBusState,
} from "./commandBus";
import {
  addCharacter,
  addHotspot,
  addItem,
  addSwitch,
  getInteractionRules,
  pasteInteraction,
  removeCharacter,
  removeHotspot,
  removeItem,
  removeSwitch,
  setHotspotRect,
  setInteraction,
  updateHotspot,
} from "./commands";
import { DatabaseStub } from "./DatabaseStub";
import { ExploreCanvas } from "./ExploreCanvas";
import { HierarchyPanel } from "./HierarchyPanel";
import { CellInspector, HotspotInspector } from "./InspectorPanels";
import {
  loadExploreDoc,
  saveExploreDoc,
  type ExplorePersistApi,
} from "./persist";
import { ProblemsPanel } from "./ProblemsPanel";
import { collectExploreProblems } from "./problems";
import type { ExploreDoc, InteractionOn, InteractionRule } from "./types";
import { VerbMatrix } from "./VerbMatrix";

export interface ExploreWorkspaceProps {
  initial: ExploreDoc;
  knownSceneIds?: Set<string>;
  /** When set, Save/Reload hit real project/scene JSON (HTTP or FS). */
  persist?: ExplorePersistApi;
}

interface WorkspaceState {
  doc: ExploreDoc;
  bus: CommandBusState;
  dirty: boolean;
}

type BottomTab = "problems" | "database";

/**
 * Self-contained Explore editor shell for M2.
 * All document mutations go through the command bus.
 */
export function ExploreWorkspace({
  initial,
  knownSceneIds,
  persist,
}: ExploreWorkspaceProps) {
  const [state, setState] = useState<WorkspaceState>(() => ({
    doc: initial,
    bus: emptyBus(),
    dirty: false,
  }));
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [bottomTab, setBottomTab] = useState<BottomTab>("problems");
  const { doc, bus, dirty } = state;

  const applyCmd = useCallback((cmd: Command) => {
    setState((s) => {
      const r = dispatch(s.bus, s.doc, cmd);
      if (r.skipped) {
        // ui-only / no content change — still adopt next doc if apply touched ui
        return { ...s, doc: r.doc };
      }
      return { doc: r.doc, bus: r.bus, dirty: true };
    });
  }, []);

  const doUndo = useCallback(() => {
    setState((s) => {
      const r = undo(s.bus, s.doc);
      if (!r) return s;
      return { doc: r.doc, bus: r.bus, dirty: true };
    });
  }, []);

  const doRedo = useCallback(() => {
    setState((s) => {
      const r = redo(s.bus, s.doc);
      if (!r) return s;
      return { doc: r.doc, bus: r.bus, dirty: true };
    });
  }, []);

  const setUi = useCallback((patch: Partial<ExploreDoc["ui"]>) => {
    setState((s) => ({ ...s, doc: patchUi(s.doc, patch) }));
  }, []);

  const selectHotspotOnly = useCallback(
    (id: string | null) => {
      setUi({ selectedHotspotId: id, selectedCell: null });
    },
    [setUi],
  );

  const doSave = useCallback(async () => {
    if (!persist) {
      setSaveStatus("未接 persist");
      return;
    }
    setSaveStatus("儲存中…");
    try {
      await saveExploreDoc(persist, state.doc);
      setState((s) => ({ ...s, dirty: false }));
      setSaveStatus("已儲存");
    } catch (e) {
      setSaveStatus(`錯誤：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [persist, state.doc]);

  const doReload = useCallback(async () => {
    if (!persist) {
      setSaveStatus("未接 persist");
      return;
    }
    setSaveStatus("重載中…");
    try {
      const next = await loadExploreDoc(persist, state.doc.scene.id);
      setState({ doc: next, bus: emptyBus(), dirty: false });
      setSaveStatus("已重載");
    } catch (e) {
      setSaveStatus(`錯誤：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [persist, state.doc.scene.id]);

  const copySelected = useCallback(() => {
    const cell = doc.ui.selectedCell;
    if (!cell) return;
    const rules = getInteractionRules(doc, cell.hotspotId, cell.on);
    setUi({ clipboardRules: rules });
  }, [doc, setUi]);

  const pasteSelected = useCallback(() => {
    const cell = doc.ui.selectedCell;
    if (!cell || !doc.ui.clipboardRules) return;
    applyCmd(pasteInteraction(cell.hotspotId, cell.on));
  }, [doc, applyCmd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === "c" || e.key === "C") {
        if (doc.ui.selectedCell) {
          e.preventDefault();
          copySelected();
        }
      } else if (e.key === "v" || e.key === "V") {
        if (doc.ui.selectedCell && doc.ui.clipboardRules) {
          e.preventDefault();
          pasteSelected();
        }
      } else if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if (e.key === "s" || e.key === "S") {
        if (persist) {
          e.preventDefault();
          void doSave();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copySelected, pasteSelected, doUndo, doRedo, doSave, persist, doc.ui]);

  const problems = useMemo(
    () => collectExploreProblems(doc, knownSceneIds),
    [doc, knownSceneIds],
  );
  const problemHs = useMemo(
    () => new Set(problems.filter((p) => p.hotspotId).map((p) => p.hotspotId!)),
    [problems],
  );

  const errorCount = problems.filter((p) => p.severity === "error").length;
  const warnCount = problems.filter((p) => p.severity === "warn").length;

  const selectedHotspot = doc.ui.selectedHotspotId
    ? doc.scene.hotspots.find((h) => h.id === doc.ui.selectedHotspotId)
    : undefined;

  const undoLabel = bus.past.length ? bus.past[bus.past.length - 1]!.label : "";
  const redoLabel = bus.future.length ? bus.future[bus.future.length - 1]!.label : "";

  return (
    <div className="explore-workspace" data-testid="explore-workspace">
      {/* 頂欄：dirty／存檔／Undo */}
      <div
        data-testid="explore-topbar"
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 8,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "6px 8px",
          background: "#1a1e28",
          border: "1px solid #333",
          borderRadius: 6,
        }}
      >
        <span
          data-testid="explore-dirty"
          data-dirty={dirty ? "1" : "0"}
          style={{
            fontSize: 12,
            padding: "2px 8px",
            borderRadius: 4,
            background: dirty ? "#532" : "#243",
            border: `1px solid ${dirty ? "#a64" : "#385"}`,
          }}
        >
          {dirty ? "未儲存 *" : "已同步"}
        </span>
        <button
          type="button"
          data-testid="undo"
          title={undoLabel ? `復原：${undoLabel}` : "復原"}
          disabled={!canUndo(bus)}
          onClick={doUndo}
        >
          復原
        </button>
        <button
          type="button"
          data-testid="redo"
          title={redoLabel ? `重做：${redoLabel}` : "重做"}
          disabled={!canRedo(bus)}
          onClick={doRedo}
        >
          重做
        </button>
        {persist ? (
          <>
            <button type="button" data-testid="explore-save" onClick={() => void doSave()}>
              存檔{dirty ? " *" : ""}
            </button>
            <button type="button" data-testid="explore-reload" onClick={() => void doReload()}>
              重載
            </button>
            <span data-testid="explore-save-status" style={{ fontSize: 12, opacity: 0.8 }}>
              {saveStatus}
            </span>
          </>
        ) : (
          <button type="button" data-testid="explore-save" disabled title="未接 persist">
            存檔
          </button>
        )}
        <button
          type="button"
          data-testid="play-placeholder"
          disabled
          title="M3：由此場景播放"
          style={{ opacity: 0.45 }}
        >
          ▶ 播放
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          data-testid="tool-select"
          onClick={() => setUi({ canvasTool: "select" })}
        >
          選取
        </button>
        <button
          type="button"
          data-testid="tool-draw"
          onClick={() => setUi({ canvasTool: "drawRect" })}
        >
          畫熱區
        </button>
        <button type="button" data-testid="add-hotspot" onClick={() => applyCmd(addHotspot())}>
          ＋熱區
        </button>
        {doc.ui.selectedHotspotId ? (
          <button
            type="button"
            data-testid="remove-hotspot"
            onClick={() => applyCmd(removeHotspot(doc.ui.selectedHotspotId!))}
          >
            刪熱區
          </button>
        ) : null}
        <button
          type="button"
          data-testid="matrix-copy"
          disabled={!doc.ui.selectedCell}
          onClick={copySelected}
        >
          複製格
        </button>
        <button
          type="button"
          data-testid="matrix-paste"
          disabled={!doc.ui.selectedCell || !doc.ui.clipboardRules}
          onClick={pasteSelected}
        >
          貼上格
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "160px 1fr 300px",
          gap: 12,
          minHeight: 420,
        }}
      >
        <HierarchyPanel doc={doc} onSelectHotspot={selectHotspotOnly} />

        <div>
          <ExploreCanvas
            doc={doc}
            onSelectHotspot={selectHotspotOnly}
            onCommitRect={(id, rect) => applyCmd(setHotspotRect(id, rect))}
            onCreateRect={(rect: Rect) =>
              applyCmd(addHotspot({ shape: { type: "rect", ...rect } }))
            }
          />
          <div style={{ marginTop: 8 }}>
            <VerbMatrix
              doc={doc}
              onSelectCell={(hotspotId, on) =>
                setUi({ selectedCell: { hotspotId, on }, selectedHotspotId: hotspotId })
              }
              problemHotspotIds={problemHs}
            />
          </div>
        </div>

        <div data-testid="inspector-column">
          <h4 style={{ margin: "0 0 8px" }}>屬性</h4>
          {doc.ui.selectedCell ? (
            <CellInspector
              doc={doc}
              onChangeRules={(rules: InteractionRule[], coalesceKey?: string) =>
                applyCmd(
                  setInteraction(
                    doc.ui.selectedCell!.hotspotId,
                    doc.ui.selectedCell!.on,
                    rules,
                    coalesceKey,
                  ),
                )
              }
            />
          ) : selectedHotspot ? (
            <HotspotInspector
              doc={doc}
              hotspot={selectedHotspot}
              onUpdate={(patch, coalesceKey) =>
                applyCmd(updateHotspot(selectedHotspot.id, patch, coalesceKey))
              }
            />
          ) : (
            <div style={{ fontSize: 12, opacity: 0.6 }} data-testid="inspector-empty">
              選熱區或矩陣格
            </div>
          )}
        </div>
      </div>

      {/* 底部 tab：Problems｜資料庫 */}
      <div style={{ marginTop: 12, borderTop: "1px solid #333", paddingTop: 8 }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <button
            type="button"
            data-testid="tab-problems"
            data-active={bottomTab === "problems" ? "1" : "0"}
            onClick={() => setBottomTab("problems")}
            style={{
              background: bottomTab === "problems" ? "#234" : "transparent",
              border: "1px solid #445",
              color: "inherit",
              padding: "4px 10px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            問題
            {problems.length ? (
              <span data-testid="problems-badge" style={{ marginLeft: 6, opacity: 0.85 }}>
                {errorCount}/{warnCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            data-testid="tab-database"
            data-active={bottomTab === "database" ? "1" : "0"}
            onClick={() => setBottomTab("database")}
            style={{
              background: bottomTab === "database" ? "#234" : "transparent",
              border: "1px solid #445",
              color: "inherit",
              padding: "4px 10px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            資料庫
          </button>
        </div>
        {bottomTab === "problems" ? (
          <ProblemsPanel problems={problems} />
        ) : (
          <DatabaseStub
            doc={doc}
            onAddCharacter={(id, name) =>
              applyCmd(addCharacter({ id, display: { "zh-Hant": name } }))
            }
            onAddSwitch={(id, name) => applyCmd(addSwitch({ id, name, init: false }))}
            onAddItem={(id, name) => applyCmd(addItem({ id, name }))}
            onRemoveCharacter={(id) => applyCmd(removeCharacter(id))}
            onRemoveSwitch={(id) => applyCmd(removeSwitch(id))}
            onRemoveItem={(id) => applyCmd(removeItem(id))}
          />
        )}
      </div>
    </div>
  );
}

export type { InteractionOn };
