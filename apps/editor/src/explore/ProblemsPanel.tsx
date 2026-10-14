import type { ExploreProblem } from "./problems";

export function ProblemsPanel({ problems }: { problems: ExploreProblem[] }) {
  return (
    <div className="problems-panel" data-testid="problems-panel">
      {problems.length === 0 ? (
        <div style={{ opacity: 0.6, fontSize: 12 }}>冇問題</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
          {problems.map((p) => (
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
      )}
    </div>
  );
}
