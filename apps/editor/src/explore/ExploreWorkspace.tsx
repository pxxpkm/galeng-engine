import { useCallback, useMemo, useState } from "react";
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
  removeCharacter,
  removeHotspot,
  removeItem,
  removeSwitch,
  setHotspotRect,
  setInteraction,
} from "./commands";
import { DatabaseStub } from "./DatabaseStub";
import { ExploreCanvas } from "./ExploreCanvas";
import { ProblemsPanel } from "./ProblemsPanel";
import { collectExploreProblems } from "./problems";
import type { ExploreDoc, InteractionOn, InteractionRule } from "./types";
import { VerbMatrix } from "./VerbMatrix";

export interface ExploreWorkspaceProps {
  initial: ExploreDoc;
  knownSceneIds?: Set<string>;
}

interface WorkspaceState {
  doc: ExploreDoc;
  bus: CommandBusState;
}

/**
 * Self-contained Explore editor shell for M2.
 * All document mutations go through the command bus.
 */
export function ExploreWorkspace({ initial, knownSceneIds }: ExploreWorkspaceProps) {
  const [state, setState] = useState<WorkspaceState>(() => ({
    doc: initial,
    bus: emptyBus(),
  }));
  const { doc, bus } = state;

  const applyCmd = useCallback((cmd: Command) => {
    setState((s) => {
      const r = dispatch(s.bus, s.doc, cmd);
      return { doc: r.doc, bus: r.bus };
    });
  }, []);

  const doUndo = useCallback(() => {
    setState((s) => {
      const r = undo(s.bus, s.doc);
      if (!r) return s;
      return { doc: r.doc, bus: r.bus };
    });
  }, []);

  const doRedo = useCallback(() => {
    setState((s) => {
      const r = redo(s.bus, s.doc);
      if (!r) return s;
      return { doc: r.doc, bus: r.bus };
    });
  }, []);

  const setUi = useCallback((patch: Partial<ExploreDoc["ui"]>) => {
    setState((s) => ({ ...s, doc: patchUi(s.doc, patch) }));
  }, []);

  const problems = useMemo(
    () => collectExploreProblems(doc, knownSceneIds),
    [doc, knownSceneIds],
  );
  const problemHs = useMemo(
    () => new Set(problems.filter((p) => p.hotspotId).map((p) => p.hotspotId!)),
    [problems],
  );

  return (
    <div className="explore-workspace" data-testid="explore-workspace">
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
        <button type="button" data-testid="undo" disabled={!canUndo(bus)} onClick={doUndo}>
          Undo
        </button>
        <button type="button" data-testid="redo" disabled={!canRedo(bus)} onClick={doRedo}>
          Redo
        </button>
        <button type="button" data-testid="tool-select" onClick={() => setUi({ canvasTool: "select" })}>
          選取
        </button>
        <button type="button" data-testid="tool-draw" onClick={() => setUi({ canvasTool: "drawRect" })}>
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
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}>
        <div>
          <ExploreCanvas
            doc={doc}
            onSelectHotspot={(id) => setUi({ selectedHotspotId: id })}
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
        <div>
          <h4 style={{ margin: "0 0 8px" }}>Inspector</h4>
          {doc.ui.selectedCell ? (
            <CellInspector
              doc={doc}
              onChangeRules={(rules) =>
                applyCmd(
                  setInteraction(doc.ui.selectedCell!.hotspotId, doc.ui.selectedCell!.on, rules),
                )
              }
            />
          ) : doc.ui.selectedHotspotId ? (
            <div style={{ fontSize: 12 }}>已選熱區：{doc.ui.selectedHotspotId}</div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.6 }}>選熱區或矩陣格</div>
          )}
          <hr />
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
          <hr />
          <ProblemsPanel problems={problems} />
        </div>
      </div>
    </div>
  );
}

function CellInspector({
  doc,
  onChangeRules,
}: {
  doc: ExploreDoc;
  onChangeRules: (rules: InteractionRule[]) => void;
}) {
  const cell = doc.ui.selectedCell!;
  const inter = doc.scene.interactions.find(
    (i) =>
      i.hotspot === cell.hotspotId &&
      (("verb" in i.on && "verb" in cell.on && i.on.verb === cell.on.verb) ||
        ("item" in i.on && "item" in cell.on && i.on.item === cell.on.item)),
  );
  const say = inter?.rules[0]?.do.find((a) => a.type === "say");
  const text = say && say.type === "say" ? say.text : "";

  return (
    <div data-testid="cell-inspector" style={{ fontSize: 12 }}>
      <div>
        {cell.hotspotId} × {"verb" in cell.on ? `verb:${cell.on.verb}` : `item:${cell.on.item}`}
      </div>
      <label>
        預設 say 文案
        <input
          data-testid="inspector-say"
          style={{ width: "100%" }}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (!v.trim()) {
              onChangeRules([]);
              return;
            }
            onChangeRules([{ when: [], do: [{ type: "say", text: v }] }]);
          }}
        />
      </label>
    </div>
  );
}

// re-export InteractionOn for callers
export type { InteractionOn };
