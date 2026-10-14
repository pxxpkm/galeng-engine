/**
 * Static Trace resolution for Explore authoring — mirrors
 * `galeng_explore::resolve_interaction` layer order without a live Engine.
 *
 * Limits: no world switches/vars/inventory; rules with `when` are treated as
 * conditional (may fall through at runtime). No hotspot visibleIf/enabledIf.
 */

import { sameOn, type ExploreDoc, type InteractionOn, type InteractionRule } from "./types";

/** Aligns with `galeng_explore::TraceLayer`. */
export type TraceLayer =
  | "Interaction"
  | "PerVerb"
  | "ItemOnHotspot"
  | "Global"
  | "Builtin"
  | "None";

export const BUILTIN_FALLBACK_TEXT = "……";

export const TRACE_LAYER_ORDER: TraceLayer[] = [
  "Interaction",
  "PerVerb",
  "ItemOnHotspot",
  "Global",
  "Builtin",
];

export const TRACE_LAYER_LABELS: Record<TraceLayer, string> = {
  Interaction: "Interaction（熱區規則）",
  PerVerb: "PerVerb（按動詞 fallback）",
  ItemOnHotspot: "ItemOnHotspot（物×熱區 fallback）",
  Global: "Global（全域 fallback）",
  Builtin: "Builtin（引擎內建）",
  None: "None（未點擊）",
};

export interface TraceChainStep {
  layer: TraceLayer;
  /** Layer is in the lookup path for this verb/item. */
  applicable: boolean;
  /** Data exists that could fire this layer. */
  present: boolean;
  detail?: string;
}

export interface TraceResolution {
  hotspotId: string;
  on: InteractionOn;
  /** Best-effort winning layer for authoring (Interaction if any rule; else fallback). */
  winningLayer: TraceLayer;
  /**
   * True when Interaction rules exist but every rule has non-empty `when` —
   * runtime may miss all and fall through to the next present fallback.
   */
  interactionConditional: boolean;
  /** Next fallback that would apply if Interaction does not fire. */
  fallbackIfMiss: TraceLayer | null;
  preview: string | null;
  chain: TraceChainStep[];
  ruleCount: number;
  unconditionalRuleCount: number;
}

export const TRACE_LIMITS_NOTE =
  "靜態 Trace：唔跑 Engine／唔評估 switches／vars／inventory；有 when 嘅規則標為條件命中，實機可能落到下一層。";

function findRules(
  doc: ExploreDoc,
  hotspotId: string,
  on: InteractionOn,
): InteractionRule[] {
  const found = doc.scene.interactions.find(
    (i) => i.hotspot === hotspotId && sameOn(i.on, on),
  );
  return found?.rules ?? [];
}

function firstSayPreview(rules: InteractionRule[]): string | null {
  for (const r of rules) {
    for (const a of r.do) {
      if (a.type === "say") return a.text;
    }
  }
  if (rules.length > 0) return `（${rules.length} 條規則，非 say）`;
  return null;
}

function resolveFallbackLayer(
  doc: ExploreDoc,
  on: InteractionOn,
): { layer: TraceLayer; preview: string | null } {
  if ("verb" in on) {
    const text = doc.project.fallback.perVerb?.[on.verb];
    if (text !== undefined && text !== "") {
      return { layer: "PerVerb", preview: text };
    }
  } else {
    const text = doc.project.fallback.itemOnHotspot;
    if (text !== undefined && text !== "") {
      return { layer: "ItemOnHotspot", preview: text };
    }
  }
  const global = doc.project.fallback.global;
  if (global !== undefined && global !== "") {
    return { layer: "Global", preview: global };
  }
  return { layer: "Builtin", preview: BUILTIN_FALLBACK_TEXT };
}

/**
 * Resolve which TraceLayer would win for hotspot × verb|item (static).
 */
export function resolveTrace(
  doc: ExploreDoc,
  hotspotId: string,
  on: InteractionOn,
): TraceResolution {
  const rules = findRules(doc, hotspotId, on);
  const unconditional = rules.filter((r) => r.when.length === 0);
  const interactionConditional = rules.length > 0 && unconditional.length === 0;
  const fb = resolveFallbackLayer(doc, on);

  const isVerb = "verb" in on;
  const perVerbText = isVerb ? doc.project.fallback.perVerb?.[on.verb] : undefined;
  const itemFb = !isVerb ? doc.project.fallback.itemOnHotspot : undefined;
  const globalText = doc.project.fallback.global;

  const chain: TraceChainStep[] = [
    {
      layer: "Interaction",
      applicable: true,
      present: rules.length > 0,
      detail:
        rules.length === 0
          ? "無規則"
          : interactionConditional
            ? `${rules.length} 條皆有 when（條件）`
            : `${rules.length} 條（${unconditional.length} 無條件）`,
    },
    {
      layer: "PerVerb",
      applicable: isVerb,
      present: isVerb && perVerbText !== undefined && perVerbText !== "",
      detail: isVerb
        ? perVerbText
          ? `"${perVerbText}"`
          : "未設 perVerb"
        : "僅動詞路徑",
    },
    {
      layer: "ItemOnHotspot",
      applicable: !isVerb,
      present: !isVerb && itemFb !== undefined && itemFb !== "",
      detail: !isVerb
        ? itemFb
          ? `"${itemFb}"`
          : "未設 itemOnHotspot"
        : "僅物路徑",
    },
    {
      layer: "Global",
      applicable: true,
      present: globalText !== undefined && globalText !== "",
      detail: globalText ? `"${globalText}"` : "未設 global",
    },
    {
      layer: "Builtin",
      applicable: true,
      present: true,
      detail: `"${BUILTIN_FALLBACK_TEXT}"`,
    },
  ];

  let winningLayer: TraceLayer;
  let preview: string | null;
  let fallbackIfMiss: TraceLayer | null = null;

  if (rules.length > 0) {
    winningLayer = "Interaction";
    preview = firstSayPreview(rules);
    fallbackIfMiss = interactionConditional ? fb.layer : null;
  } else {
    winningLayer = fb.layer;
    preview = fb.preview;
    fallbackIfMiss = null;
  }

  return {
    hotspotId,
    on,
    winningLayer,
    interactionConditional,
    fallbackIfMiss,
    preview,
    chain,
    ruleCount: rules.length,
    unconditionalRuleCount: unconditional.length,
  };
}

export function formatOnLabel(on: InteractionOn): string {
  return "verb" in on ? `動詞 ${on.verb}` : `物 ${on.item}`;
}
