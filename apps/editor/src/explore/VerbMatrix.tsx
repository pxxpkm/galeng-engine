import { buildMatrix, getCell, type MatrixCell } from "./matrix";
import type { ExploreDoc, InteractionOn } from "./types";

export interface VerbMatrixProps {
  doc: ExploreDoc;
  onSelectCell: (hotspotId: string, on: InteractionOn) => void;
  /** Matrix row header (hotspot name) — select hotspot; rebind last verb/item if any. */
  onSelectHotspot?: (hotspotId: string) => void;
  problemHotspotIds?: Set<string>;
}

function cellLabel(cell: MatrixCell): string {
  switch (cell.kind) {
    case "empty":
      return "·";
    case "filled":
      return "●";
    case "multi":
      return "▣";
    case "na":
      return "—";
    case "problem":
      return "!";
  }
}

function cellTitle(cell: MatrixCell): string {
  if (cell.kind === "empty" && cell.fallbackPreview) {
    return `fallback: ${cell.fallbackPreview}`;
  }
  if (cell.rules.length > 0) {
    return `${cell.rules.length} rule(s)`;
  }
  return "empty";
}

/** Sparse Verb×hotspot (+ item columns) matrix. Click cell → Inspector. */
export function VerbMatrix({ doc, onSelectCell, onSelectHotspot, problemHotspotIds }: VerbMatrixProps) {
  const model = buildMatrix(doc);
  const sel = doc.ui.selectedCell;
  const selHs = doc.ui.selectedHotspotId;

  const renderCell = (hotspotId: string, on: InteractionOn) => {
    const cell = getCell(model, hotspotId, on)!;
    const selected =
      sel && sel.hotspotId === hotspotId && (
        ("verb" in sel.on && "verb" in on && sel.on.verb === on.verb) ||
        ("item" in sel.on && "item" in on && sel.on.item === on.item)
      );
    const problem = problemHotspotIds?.has(hotspotId);
    return (
      <td
        key={"verb" in on ? on.verb : on.item}
        data-testid={`matrix-cell-${hotspotId}-${"verb" in on ? on.verb : `item-${on.item}`}`}
        data-kind={cell.kind}
        title={cellTitle(cell)}
        onClick={() => onSelectCell(hotspotId, on)}
        style={{
          textAlign: "center",
          cursor: "pointer",
          background: selected ? "#234" : problem ? "#422" : undefined,
          minWidth: 28,
          padding: "4px 6px",
          border: "1px solid #333",
        }}
      >
        {cellLabel(cell)}
      </td>
    );
  };

  return (
    <div className="verb-matrix" data-testid="verb-matrix">
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
        覆蓋率（資訊）：{model.coverage.filled}/{model.coverage.total} 動詞格已填（不要求填滿）
      </div>
      <div style={{ overflow: "auto", maxHeight: 280 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", border: "1px solid #333", padding: 4 }}>熱區</th>
              {model.verbColumns.map((v) => (
                <th key={v.id} style={{ border: "1px solid #333", padding: 4 }} title={v.id}>
                  {v.label}
                </th>
              ))}
              {model.itemColumns.map((it) => (
                <th
                  key={`item-${it.id}`}
                  style={{ border: "1px solid #333", padding: 4, color: "#c9a" }}
                  title={`item:${it.id}`}
                >
                  🎒{it.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.hotspotIds.map((hid) => (
              <tr key={hid}>
                <td
                  data-testid={`matrix-row-${hid}`}
                  title="選擇此熱區"
                  onClick={() => onSelectHotspot?.(hid)}
                  style={{
                    border: "1px solid #333",
                    padding: 4,
                    cursor: onSelectHotspot ? "pointer" : undefined,
                    background: selHs === hid ? "#234" : undefined,
                    fontWeight: selHs === hid ? 600 : undefined,
                  }}
                >
                  {model.hotspotNames[hid] ?? hid}
                </td>
                {model.verbColumns.map((v) => renderCell(hid, { verb: v.id }))}
                {model.itemColumns.map((it) => renderCell(hid, { item: it.id }))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
