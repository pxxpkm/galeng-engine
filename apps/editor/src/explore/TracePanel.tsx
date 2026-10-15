import {
  TRACE_LAYER_LABELS,
  TRACE_LAYER_ORDER,
  TRACE_LIMITS_NOTE,
  formatOnLabel,
  type TraceResolution,
} from "./trace";

export function TracePanel({
  resolution,
}: {
  /** Null when no matrix cell selected. */
  resolution: TraceResolution | null;
}) {
  return (
    <div className="trace-panel" data-testid="trace-panel" style={{ fontSize: 12 }}>
      <div
        data-testid="trace-legend"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 10,
          opacity: 0.9,
        }}
      >
        <span style={{ opacity: 0.65 }}>命中層級（優先序）：</span>
        {TRACE_LAYER_ORDER.map((layer, i) => (
          <span
            key={layer}
            data-testid={`trace-legend-${layer}`}
            style={{
              border: "1px solid #445",
              borderRadius: 4,
              padding: "2px 6px",
              background: "#1a2030",
            }}
          >
            {i + 1}. {TRACE_LAYER_LABELS[layer]}
          </span>
        ))}
      </div>

      {!resolution ? (
        <div data-testid="trace-empty" style={{ opacity: 0.65 }}>
          請選擇矩陣格（熱區 × 動詞／物）以查看哪一層會勝出。
        </div>
      ) : (
        <div data-testid="trace-resolution">
          <div style={{ marginBottom: 8 }}>
            <strong data-testid="trace-target">
              {resolution.hotspotId} × {formatOnLabel(resolution.on)}
            </strong>
            <span style={{ marginLeft: 10 }}>
              預計勝出：
              <span
                data-testid="trace-winning"
                data-layer={resolution.winningLayer}
                style={{
                  marginLeft: 4,
                  color: "#8cf",
                  fontWeight: 600,
                }}
              >
                {TRACE_LAYER_LABELS[resolution.winningLayer]}
              </span>
            </span>
          </div>
          {resolution.preview ? (
            <div data-testid="trace-preview" style={{ marginBottom: 8, opacity: 0.85 }}>
              預覽：{resolution.preview}
            </div>
          ) : null}
          {resolution.interactionConditional ? (
            <div
              data-testid="trace-conditional"
              style={{ marginBottom: 8, color: "#fc6" }}
            >
              Interaction 全部有 when；實機若條件不成立會落到{" "}
              {resolution.fallbackIfMiss
                ? TRACE_LAYER_LABELS[resolution.fallbackIfMiss]
                : "下一層後備規則"}
              。
            </div>
          ) : null}
          <table
            data-testid="trace-chain"
            style={{
              borderCollapse: "collapse",
              width: "100%",
              maxWidth: 720,
              marginBottom: 8,
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.7 }}>
                <th style={{ padding: "2px 6px" }}>層</th>
                <th style={{ padding: "2px 6px" }}>適用</th>
                <th style={{ padding: "2px 6px" }}>有資料</th>
                <th style={{ padding: "2px 6px" }}>詳情</th>
              </tr>
            </thead>
            <tbody>
              {resolution.chain.map((step) => {
                const win = step.layer === resolution.winningLayer;
                return (
                  <tr
                    key={step.layer}
                    data-testid={`trace-step-${step.layer}`}
                    data-present={step.present ? "1" : "0"}
                    data-applicable={step.applicable ? "1" : "0"}
                    data-win={win ? "1" : "0"}
                    style={{
                      background: win ? "#1e3a4a" : "transparent",
                      opacity: step.applicable ? 1 : 0.45,
                    }}
                  >
                    <td style={{ padding: "2px 6px" }}>
                      {TRACE_LAYER_LABELS[step.layer]}
                      {win ? " ←" : ""}
                    </td>
                    <td style={{ padding: "2px 6px" }}>
                      {step.applicable ? "是" : "否"}
                    </td>
                    <td style={{ padding: "2px 6px" }}>
                      {step.present ? "是" : "否"}
                    </td>
                    <td style={{ padding: "2px 6px" }}>{step.detail ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div
        data-testid="trace-limits"
        style={{ opacity: 0.55, fontSize: 11, marginTop: 4 }}
      >
        {TRACE_LIMITS_NOTE}
      </div>
    </div>
  );
}
