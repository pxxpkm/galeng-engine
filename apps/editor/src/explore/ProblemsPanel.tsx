import {
  formatProblemContext,
  formatProblemSeverity,
  problemNavTarget,
  type ExploreProblem,
} from "./problems";

function groupByScene(problems: ExploreProblem[]): [string | undefined, ExploreProblem[]][] {
  const order: (string | undefined)[] = [];
  const map = new Map<string | undefined, ExploreProblem[]>();
  for (const p of problems) {
    const key = p.sceneId;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(p);
  }
  return order.map((k) => [k, map.get(k)!]);
}

export function ProblemsPanel({
  problems,
  onNavigate,
}: {
  problems: ExploreProblem[];
  /** Click a row → select hotspot/cell or focus onEnter. */
  onNavigate?: (p: ExploreProblem) => void;
}) {
  if (problems.length === 0) {
    return (
      <div className="problems-panel" data-testid="problems-panel">
        <div style={{ opacity: 0.6, fontSize: 12 }}>無問題</div>
      </div>
    );
  }

  const groups = groupByScene(problems);
  const multi = groups.length > 1 || groups[0]?.[0] !== undefined;

  return (
    <div className="problems-panel" data-testid="problems-panel">
      {groups.map(([sceneId, list]) => (
        <div
          key={sceneId ?? "_current"}
          data-testid={sceneId ? `problem-scene-${sceneId}` : "problem-scene-current"}
          style={{ marginBottom: multi ? 10 : 0 }}
        >
          {sceneId ? (
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{sceneId}</div>
          ) : null}
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {list.map((p) => {
              const nav = problemNavTarget(p);
              const clickable = !!onNavigate && nav.kind !== "none";
              return (
                <li
                  key={p.id}
                  data-testid={`problem-${p.id}`}
                  data-severity={p.severity}
                  data-nav={nav.kind}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={() => {
                    if (clickable) onNavigate(p);
                  }}
                  onKeyDown={(e) => {
                    if (!clickable) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onNavigate(p);
                    }
                  }}
                  style={{
                    color: p.severity === "error" ? "#f88" : "#fc6",
                    cursor: clickable ? "pointer" : undefined,
                    marginBottom: 4,
                  }}
                  title={clickable ? "前往此問題位置" : undefined}
                >
                  <span>[{formatProblemSeverity(p.severity)}]</span>{" "}
                  <span style={{ opacity: 0.8 }}>{formatProblemContext(p)}</span>
                  {" — "}
                  {p.message}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
