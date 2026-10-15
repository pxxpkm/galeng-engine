import { onKey, sameOn, type ExploreDoc, type Interaction, type InteractionOn, type InteractionRule } from "./types";

export type MatrixCellKind =
  | "empty"
  | "filled"
  | "multi"
  | "na"
  | "problem";

export interface MatrixCell {
  hotspotId: string;
  on: InteractionOn;
  kind: MatrixCellKind;
  rules: InteractionRule[];
  /** Fallback preview when empty (verb cells only). */
  fallbackPreview: string | null;
}

export interface MatrixModel {
  hotspotIds: string[];
  hotspotNames: Record<string, string>;
  verbColumns: { id: string; label: string }[];
  itemColumns: { id: string; label: string }[];
  cells: Map<string, MatrixCell>;
  /** filled / (hotspots * verbCols) — informational only. */
  coverage: { filled: number; total: number };
}

function cellMapKey(hotspotId: string, on: InteractionOn): string {
  return `${hotspotId}|${onKey(on)}`;
}

function findInteraction(
  interactions: Interaction[],
  hotspotId: string,
  on: InteractionOn,
): Interaction | undefined {
  return interactions.find((i) => i.hotspot === hotspotId && sameOn(i.on, on));
}

/** Prefer "problem" when this cell has a linked ExploreProblem. */
export function kindOf(rules: InteractionRule[], hasProblem = false): MatrixCellKind {
  if (hasProblem) return "problem";
  if (rules.length === 0) return "empty";
  if (rules.length > 1 || rules.some((r) => r.when.length > 0)) return "multi";
  return "filled";
}

export function buildMatrix(
  doc: ExploreDoc,
  /** Keys from buildProblemMatrixKeys — cells show「!」. */
  problemKeys?: Set<string>,
): MatrixModel {
  const hotspotIds = doc.scene.hotspots.map((h) => h.id);
  const hotspotNames: Record<string, string> = {};
  for (const h of doc.scene.hotspots) hotspotNames[h.id] = h.name;

  const verbColumns = doc.project.verbs.map((v) => ({ id: v.id, label: v.label }));
  const itemColumns = doc.project.items.map((i) => ({ id: i.id, label: i.name }));

  const cells = new Map<string, MatrixCell>();
  let filled = 0;
  const total = hotspotIds.length * verbColumns.length;

  for (const hid of hotspotIds) {
    for (const v of verbColumns) {
      const on: InteractionOn = { verb: v.id };
      const inter = findInteraction(doc.scene.interactions, hid, on);
      const rules = inter?.rules ?? [];
      if (rules.length > 0) filled += 1;
      const fb = doc.project.fallback.perVerb?.[v.id] ?? doc.project.fallback.global ?? null;
      cells.set(cellMapKey(hid, on), {
        hotspotId: hid,
        on,
        kind: kindOf(rules, problemKeys?.has(cellMapKey(hid, on)) ?? false),
        rules,
        fallbackPreview: rules.length === 0 ? fb : null,
      });
    }
    for (const it of itemColumns) {
      const on: InteractionOn = { item: it.id };
      const inter = findInteraction(doc.scene.interactions, hid, on);
      const rules = inter?.rules ?? [];
      cells.set(cellMapKey(hid, on), {
        hotspotId: hid,
        on,
        kind: kindOf(rules, problemKeys?.has(cellMapKey(hid, on)) ?? false),
        rules,
        fallbackPreview:
          rules.length === 0
            ? (doc.project.fallback.itemOnHotspot ?? doc.project.fallback.global ?? null)
            : null,
      });
    }
  }

  return { hotspotIds, hotspotNames, verbColumns, itemColumns, cells, coverage: { filled, total } };
}

export function getCell(
  model: MatrixModel,
  hotspotId: string,
  on: InteractionOn,
): MatrixCell | undefined {
  return model.cells.get(cellMapKey(hotspotId, on));
}
