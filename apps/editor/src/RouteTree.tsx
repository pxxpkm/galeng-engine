import { exitHint, layoutRouteTree, type RouteEdge, type RouteTreeNode, type RouteView } from "./route";
import type { Exit } from "./types";

type Translate = (key: string) => string;

function edgeCaption(edge: RouteEdge, t: Translate): string {
  let base: string;
  if (edge.kind === "choice") {
    base = edge.label || "…";
  } else if (edge.kind === "next") {
    base = t("editor.routeNext");
  } else if (edge.kind === "branchThen") {
    base = t("editor.routeThen");
  } else {
    base = t("editor.routeElse");
  }
  const bits: string[] = [base];
  if (edge.setNote) {
    bits.push(edge.setNote);
  }
  if (edge.ifNote) {
    bits.push(`${t("editor.routeHasIf")} ${edge.ifNote}`);
  } else if (edge.hasIf) {
    bits.push(t("editor.routeHasIf"));
  }
  return bits.join(" · ");
}

function nodeCaption(node: RouteTreeNode, t: Translate): string {
  if (node.kind === "missing") {
    return node.id ? `${node.id} · ${t("editor.routeMissing")}` : t("editor.routeEmptyGoto");
  }
  const name = node.title || node.id;
  if (node.kind === "revisit") {
    return `${name} · ${t("editor.routeRevisit")}`;
  }
  if (node.kind === "ending") {
    return `${name} · ${t("editor.routeEnding")}`;
  }
  return name;
}

export function SceneExitHint({
  exit,
  ids,
  t,
}: {
  exit: Exit | undefined;
  ids: Set<string>;
  t: Translate;
}) {
  const hint = exitHint(exit, ids);
  if (hint.ending) {
    return <span className="scene-exit-hint">{t("editor.routeEnding")}</span>;
  }
  return (
    <span className={`scene-exit-hint${hint.missing ? " missing" : ""}`}>
      {hint.targets.map((to) => to || "?").join(" · ")}
    </span>
  );
}

function RouteDiagram({
  root,
  currentId,
  onSelect,
  t,
}: {
  root: RouteTreeNode;
  currentId: string;
  onSelect: (id: string) => void;
  t: Translate;
}) {
  const diagram = layoutRouteTree(root);
  const pointsAttr = (points: { x: number; y: number }[]) =>
    points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <div className="route-diagram" style={{ width: diagram.width, height: diagram.height }}>
      <svg
        className="route-diagram-lines"
        width={diagram.width}
        height={diagram.height}
        viewBox={`0 0 ${diagram.width} ${diagram.height}`}
        aria-hidden="true"
      >
        {diagram.links.map((link, i) => (
          <polyline
            key={`l-${i}`}
            className={`route-diagram-line${link.dangling ? " missing" : ""}${link.hasIf ? " has-if" : ""}`}
            fill="none"
            points={pointsAttr(link.points)}
          />
        ))}
      </svg>
      {diagram.links.map((link, i) => (
        <div
          key={`e-${i}`}
          className={`route-diagram-edge${link.dangling ? " missing" : ""}${link.hasIf ? " has-if" : ""}`}
          style={{ left: link.mid.x, top: link.mid.y }}
        >
          {edgeCaption(link.edge, t)}
        </div>
      ))}
      {diagram.boxes.map((box) => {
        const fake: RouteTreeNode = { id: box.id, kind: box.kind, title: box.title, children: [] };
        const clickable = box.kind !== "missing" && box.id.length > 0;
        const className = `route-diagram-node${box.id === currentId ? " current" : ""}${box.kind === "missing" ? " missing" : ""}`;
        return clickable ? (
          <button
            key={box.path}
            type="button"
            className={className}
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
            onClick={() => onSelect(box.id)}
          >
            {nodeCaption(fake, t)}
          </button>
        ) : (
          <span
            key={box.path}
            className={className}
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          >
            {nodeCaption(fake, t)}
          </span>
        );
      })}
    </div>
  );
}

export function RouteTree({
  view,
  currentId,
  onSelect,
  t,
}: {
  view: RouteView;
  currentId: string;
  onSelect: (id: string) => void;
  t: Translate;
}) {
  return (
    <div className="route-tree">
      {view.startMissing ? <p className="route-banner">{t("editor.routeStartMissing")}</p> : null}
      {view.root ? (
        <RouteDiagram root={view.root} currentId={currentId} onSelect={onSelect} t={t} />
      ) : null}
      {view.orphans.length > 0 ? (
        <div className="route-orphans">
          <div className="route-orphans-title">{t("editor.routeOrphans")}</div>
          <ul>
            {view.orphans.map((scene) => (
              <li key={scene.id}>
                <button
                  type="button"
                  className={`route-node${scene.id === currentId ? " current" : ""}`}
                  onClick={() => onSelect(scene.id)}
                >
                  {scene.title || scene.id}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
