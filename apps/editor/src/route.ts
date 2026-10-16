import type { Exit, Scene, SceneMeta } from "./types";

export type RouteEdgeKind = "next" | "choice" | "branchThen" | "branchElse";

export interface RouteEdge {
  kind: RouteEdgeKind;
  to: string;
  label: string;
  hasIf: boolean;
  setNote?: string;
  ifNote?: string;
}

export type RouteNodeKind = "scene" | "ending" | "missing" | "revisit";

export interface RouteTreeNode {
  id: string;
  kind: RouteNodeKind;
  title?: string;
  children: RouteChild[];
}

export interface RouteChild {
  edge: RouteEdge;
  dangling: boolean;
  node: RouteTreeNode;
}

export interface RouteView {
  root: RouteTreeNode | null;
  startMissing: boolean;
  orphans: SceneMeta[];
}

export function overlayCurrent(metas: SceneMeta[], current: Scene | null): SceneMeta[] {
  if (!current) {
    return metas;
  }
  return metas.map((meta) =>
    meta.id === current.id
      ? { id: current.id, title: current.title, exit: current.exit }
      : meta,
  );
}

export function upsertSceneMeta(list: SceneMeta[], scene: Scene): SceneMeta[] {
  const meta: SceneMeta = { id: scene.id, title: scene.title, exit: scene.exit };
  const index = list.findIndex((item) => item.id === scene.id);
  if (index < 0) {
    return [...list, meta].sort((a, b) => a.id.localeCompare(b.id));
  }
  const next = list.slice();
  next[index] = meta;
  return next;
}

export function formatSetNote(set: Record<string, string | number | boolean> | undefined): string {
  if (!set) {
    return "";
  }
  return Object.entries(set)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, value]) => `${key} ${value}`)
    .join(" · ");
}

export function formatIfKeys(ifVal: unknown): string {
  if (!ifVal || typeof ifVal !== "object" || Array.isArray(ifVal)) {
    return "";
  }
  return Object.keys(ifVal as Record<string, unknown>)
    .filter((key) => key.trim().length > 0)
    .join(" · ");
}

export function exitEdges(exit: Exit | undefined): RouteEdge[] {
  if (!exit) {
    return [];
  }
  if (exit.type === "next") {
    return [{ kind: "next", to: exit.goto ?? "", label: "", hasIf: false }];
  }
  if (exit.type === "choices") {
    return (exit.options ?? []).map((opt) => {
      const setNote = formatSetNote(opt.set);
      const ifNote = formatIfKeys(opt.if);
      const edge: RouteEdge = {
        kind: "choice",
        to: opt.goto ?? "",
        label: opt.text ?? "",
        hasIf: opt.if != null,
      };
      if (setNote) {
        edge.setNote = setNote;
      }
      if (ifNote) {
        edge.ifNote = ifNote;
      }
      return edge;
    });
  }
  if (exit.type === "return" || exit.type === "end") {
    return [];
  }
  if (exit.type === "call") {
    return [{ kind: "next", to: exit.scene ?? "", label: "", hasIf: false }];
  }
  const ifNote = formatIfKeys(exit.if);
  const thenEdge: RouteEdge = {
    kind: "branchThen",
    to: exit.then ?? "",
    label: "",
    hasIf: exit.if != null,
  };
  if (ifNote) {
    thenEdge.ifNote = ifNote;
  }
  return [thenEdge, { kind: "branchElse", to: exit.else ?? "", label: "", hasIf: false }];
}

export function exitHint(exit: Exit | undefined, ids: Set<string>): {
  ending: boolean;
  targets: string[];
  missing: boolean;
} {
  const edges = exitEdges(exit);
  if (edges.length === 0) {
    return { ending: true, targets: [], missing: false };
  }
  const targets = edges.map((edge) => edge.to);
  return {
    ending: false,
    targets,
    missing: targets.some((to) => !to || !ids.has(to)),
  };
}

export const ROUTE_NODE_W = 112;
export const ROUTE_NODE_H = 36;
export const ROUTE_GAP_X = 16;
export const ROUTE_GAP_Y = 68;

export type RouteBox = {
  id: string;
  kind: RouteNodeKind;
  title?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  path: string;
};

export type RouteLink = {
  points: { x: number; y: number }[];
  mid: { x: number; y: number };
  dangling: boolean;
  hasIf: boolean;
  edge: RouteEdge;
};

export type RouteDiagram = {
  width: number;
  height: number;
  boxes: RouteBox[];
  links: RouteLink[];
};

function subtreeWidth(node: RouteTreeNode, memo: Map<RouteTreeNode, number>): number {
  const hit = memo.get(node);
  if (hit !== undefined) {
    return hit;
  }
  if (node.children.length === 0) {
    memo.set(node, ROUTE_NODE_W);
    return ROUTE_NODE_W;
  }
  let inner = 0;
  node.children.forEach((child, i) => {
    inner += subtreeWidth(child.node, memo);
    if (i > 0) {
      inner += ROUTE_GAP_X;
    }
  });
  const width = Math.max(ROUTE_NODE_W, inner);
  memo.set(node, width);
  return width;
}

function placeNode(
  node: RouteTreeNode,
  left: number,
  depth: number,
  path: string,
  memo: Map<RouteTreeNode, number>,
  boxes: RouteBox[],
  links: RouteLink[],
): void {
  const width = subtreeWidth(node, memo);
  const x = left + (width - ROUTE_NODE_W) / 2;
  const y = depth * (ROUTE_NODE_H + ROUTE_GAP_Y);
  boxes.push({
    id: node.id,
    kind: node.kind,
    title: node.title,
    x,
    y,
    w: ROUTE_NODE_W,
    h: ROUTE_NODE_H,
    path,
  });
  const parentCx = x + ROUTE_NODE_W / 2;
  const parentBy = y + ROUTE_NODE_H;
  const childTop = y + ROUTE_NODE_H + ROUTE_GAP_Y;
  const elbowY = y + ROUTE_NODE_H + ROUTE_GAP_Y / 2;
  let childLeft = left + (width - innerWidth(node, memo)) / 2;
  node.children.forEach((child, i) => {
    const cw = subtreeWidth(child.node, memo);
    const childX = childLeft + (cw - ROUTE_NODE_W) / 2;
    const childCx = childX + ROUTE_NODE_W / 2;
    const points =
      node.children.length === 1
        ? [
            { x: parentCx, y: parentBy },
            { x: childCx, y: childTop },
          ]
        : [
            { x: parentCx, y: parentBy },
            { x: parentCx, y: elbowY },
            { x: childCx, y: elbowY },
            { x: childCx, y: childTop },
          ];
    links.push({
      points,
      mid: { x: (parentCx + childCx) / 2, y: node.children.length === 1 ? (parentBy + childTop) / 2 : elbowY },
      dangling: child.dangling,
      hasIf: child.edge.hasIf,
      edge: child.edge,
    });
    placeNode(child.node, childLeft, depth + 1, `${path}/${i}`, memo, boxes, links);
    childLeft += cw + ROUTE_GAP_X;
  });
}

function innerWidth(node: RouteTreeNode, memo: Map<RouteTreeNode, number>): number {
  if (node.children.length === 0) {
    return ROUTE_NODE_W;
  }
  return node.children.reduce((sum, child, i) => {
    return sum + subtreeWidth(child.node, memo) + (i > 0 ? ROUTE_GAP_X : 0);
  }, 0);
}

/** Top-down boxes and elbow lines. Not author-editable coordinates. */
export function layoutRouteTree(root: RouteTreeNode | null): RouteDiagram {
  if (!root) {
    return { width: 0, height: 0, boxes: [], links: [] };
  }
  const memo = new Map<RouteTreeNode, number>();
  const width = subtreeWidth(root, memo);
  const boxes: RouteBox[] = [];
  const links: RouteLink[] = [];
  placeNode(root, 0, 0, "0", memo, boxes, links);
  const height = boxes.reduce((max, box) => Math.max(max, box.y + box.h), 0);
  return { width, height, boxes, links };
}

export function buildRouteTree(startScene: string, scenes: SceneMeta[]): RouteView {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const ids = new Set(scenes.map((scene) => scene.id));
  const reached = new Set<string>();

  if (!startScene) {
    return { root: null, startMissing: true, orphans: scenes };
  }

  function walk(id: string, seen: Set<string>): RouteTreeNode {
    const scene = byId.get(id);
    if (!scene) {
      return { id, kind: "missing", children: [] };
    }
    if (seen.has(id)) {
      return { id, kind: "revisit", title: scene.title, children: [] };
    }
    reached.add(id);
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    const edges = exitEdges(scene.exit);
    if (edges.length === 0) {
      return { id, kind: "ending", title: scene.title, children: [] };
    }
    return {
      id,
      kind: "scene",
      title: scene.title,
      children: edges.map((edge) => {
        const dangling = !edge.to || !ids.has(edge.to);
        return {
          edge,
          dangling,
          node: dangling ? { id: edge.to, kind: "missing", children: [] } : walk(edge.to, nextSeen),
        };
      }),
    };
  }

  const startExists = ids.has(startScene);
  return {
    root: startExists
      ? walk(startScene, new Set())
      : { id: startScene, kind: "missing", children: [] },
    startMissing: !startExists,
    orphans: scenes.filter((scene) => !reached.has(scene.id)),
  };
}
