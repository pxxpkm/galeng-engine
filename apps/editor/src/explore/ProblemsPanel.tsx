import type { ExploreProblem } from "./problems";

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

export function ProblemsPanel({ problems }: { problems: ExploreProblem[] }) {
  if (problems.length === 0) {
    return (
      <div className="problems-panel" data-testid="problems-panel">
        <div style={{ opacity: 0.6, fontSize: 12 }}>冇問題</div>
      </div>
    );
  }

  const groups = groupByScene(problems);
  const multi = groups.length > 1 || (groups[0]?.[0] !== undefined);

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
            {list.map((p) => (
              <li
                key={p.id}
                data-testid={`problem-${p.id}`}
                data-severity={p.severity}
                style={{ color: p.severity === "error" ? "#f88" : "#fc6" }}
              >
                [{p.severity}] {p.message}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
