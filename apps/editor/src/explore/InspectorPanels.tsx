import {
  EDITABLE_ACTION_TYPES,
  actionChipLabel,
  addAction,
  addRule,
  addWhen,
  getCellRules,
  interactionCoalesceKey,
  isEditableAction,
  isEditablePred,
  patchAction,
  patchPred,
  predChipLabel,
  removeAction,
  removeRule,
  removeWhen,
  type EditableActionType,
} from "./inspectorModel";
import type {
  ExploreAction,
  ExploreDoc,
  Hotspot,
  InteractionOn,
  InteractionRule,
  Pred,
} from "./types";

export interface CellInspectorProps {
  doc: ExploreDoc;
  onChangeRules: (rules: InteractionRule[], coalesceKey?: string) => void;
}

/** Rule-card Inspector for a matrix cell — When/Do via GUI; never wipe unsupported. */
export function CellInspector({ doc, onChangeRules }: CellInspectorProps) {
  const cell = doc.ui.selectedCell!;
  const rules = getCellRules(doc, cell.hotspotId, cell.on);
  const switches = doc.project.switches;
  const items = doc.project.items;
  const onLabel =
    "verb" in cell.on ? `動詞：${cell.on.verb}` : `物品：${cell.on.item}`;

  const commit = (next: InteractionRule[], coalesceKey?: string) => {
    onChangeRules(next, coalesceKey);
  };

  return (
    <div data-testid="cell-inspector" style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>
        {cell.hotspotId} × {onLabel}
      </div>
      {rules.length === 0 ? (
        <div style={{ opacity: 0.65, marginBottom: 8 }}>無規則（靠 fallback）</div>
      ) : null}
      {rules.map((rule, ri) => (
        <RuleCard
          key={ri}
          index={ri}
          rule={rule}
          switches={switches}
          items={items}
          hotspotId={cell.hotspotId}
          on={cell.on}
          onPatch={(next, coalesceKey) => commit(next, coalesceKey)}
          onRemove={() => commit(removeRule(rules, ri))}
          allRules={rules}
        />
      ))}
      <button
        type="button"
        data-testid="inspector-add-rule"
        style={{ marginTop: 6 }}
        onClick={() => commit(addRule(rules))}
      >
        ＋規則
      </button>
    </div>
  );
}

function RuleCard({
  index,
  rule,
  switches,
  items,
  hotspotId,
  on,
  allRules,
  onPatch,
  onRemove,
}: {
  index: number;
  rule: InteractionRule;
  switches: ExploreDoc["project"]["switches"];
  items: ExploreDoc["project"]["items"];
  hotspotId: string;
  on: InteractionOn;
  allRules: InteractionRule[];
  onPatch: (rules: InteractionRule[], coalesceKey?: string) => void;
  onRemove: () => void;
}) {
  return (
    <div
      data-testid={`rule-card-${index}`}
      style={{
        border: "1px solid #445",
        borderRadius: 6,
        padding: 8,
        marginBottom: 8,
        background: "#1a1e28",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <strong>規則 {index + 1}</strong>
        <button type="button" data-testid={`rule-remove-${index}`} onClick={onRemove}>
          刪規則
        </button>
      </div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ opacity: 0.75, marginBottom: 4 }}>When（條件）</div>
        {rule.when.map((p, pi) =>
          isEditablePred(p) ? (
            <div
              key={pi}
              data-testid={`when-row-${index}-${pi}`}
              style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center" }}
            >
              <select
                data-testid={`when-switch-${index}-${pi}`}
                value={p.switch}
                onChange={(e) => {
                  const next: Pred = { switch: e.target.value, is: p.is };
                  onPatch(patchPred(allRules, index, pi, next));
                }}
              >
                <option value="">（揀開關）</option>
                {switches.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name ? `${s.name} (${s.id})` : s.id}
                  </option>
                ))}
                {p.switch && !switches.some((s) => s.id === p.switch) ? (
                  <option value={p.switch}>{p.switch}（未知）</option>
                ) : null}
              </select>
              <select
                data-testid={`when-is-${index}-${pi}`}
                value={p.is ? "true" : "false"}
                onChange={(e) => {
                  const next: Pred = { switch: p.switch, is: e.target.value === "true" };
                  onPatch(patchPred(allRules, index, pi, next));
                }}
              >
                <option value="true">係 true</option>
                <option value="false">係 false</option>
              </select>
              <button
                type="button"
                data-testid={`when-remove-${index}-${pi}`}
                onClick={() => onPatch(removeWhen(allRules, index, pi))}
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              key={pi}
              data-testid={`when-readonly-${index}-${pi}`}
              style={{
                display: "inline-block",
                padding: "2px 6px",
                marginBottom: 4,
                marginRight: 4,
                background: "#333",
                borderRadius: 4,
                opacity: 0.85,
              }}
              title="未支援嘅條件（只讀保留）"
            >
              {predChipLabel(p)}
            </div>
          ),
        )}
        <button
          type="button"
          data-testid={`when-add-${index}`}
          onClick={() =>
            onPatch(addWhen(allRules, index, switches[0]?.id ?? ""))
          }
        >
          ＋條件
        </button>
      </div>

      <div>
        <div style={{ opacity: 0.75, marginBottom: 4 }}>Do（動作）</div>
        {rule.do.map((a, ai) =>
          isEditableAction(a) ? (
            <EditableActionRow
              key={ai}
              ruleIndex={index}
              actionIndex={ai}
              action={a}
              switches={switches}
              items={items}
              hotspotId={hotspotId}
              on={on}
              allRules={allRules}
              onPatch={onPatch}
            />
          ) : (
            <div
              key={ai}
              data-testid={`action-readonly-${index}-${ai}`}
              style={{
                display: "inline-block",
                padding: "2px 6px",
                marginBottom: 4,
                marginRight: 4,
                background: "#333",
                borderRadius: 4,
                opacity: 0.85,
              }}
              title="未支援嘅動作（只讀保留）"
            >
              {actionChipLabel(a)}
            </div>
          ),
        )}
        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
          {EDITABLE_ACTION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              data-testid={`action-add-${index}-${t}`}
              onClick={() => onPatch(addAction(allRules, index, t))}
            >
              ＋{t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditableActionRow({
  ruleIndex,
  actionIndex,
  action,
  switches,
  items,
  hotspotId,
  on,
  allRules,
  onPatch,
}: {
  ruleIndex: number;
  actionIndex: number;
  action: Extract<ExploreAction, { type: EditableActionType }>;
  switches: ExploreDoc["project"]["switches"];
  items: ExploreDoc["project"]["items"];
  hotspotId: string;
  on: InteractionOn;
  allRules: InteractionRule[];
  onPatch: (rules: InteractionRule[], coalesceKey?: string) => void;
}) {
  const typeSelect = (
    <select
      data-testid={`action-type-${ruleIndex}-${actionIndex}`}
      value={action.type}
      onChange={(e) => {
        const t = e.target.value as EditableActionType;
        let next: ExploreAction;
        if (t === "say") next = { type: "say", text: action.type === "say" ? action.text : "" };
        else if (t === "setSwitch")
          next = {
            type: "setSwitch",
            id: action.type === "setSwitch" ? action.id : switches[0]?.id ?? "",
            value: action.type === "setSwitch" ? action.value : true,
          };
        else
          next = {
            type: "giveItem",
            id: action.type === "giveItem" ? action.id : items[0]?.id ?? "",
          };
        onPatch(patchAction(allRules, ruleIndex, actionIndex, next));
      }}
    >
      {EDITABLE_ACTION_TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );

  return (
    <div
      data-testid={`action-row-${ruleIndex}-${actionIndex}`}
      style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center", flexWrap: "wrap" }}
    >
      {typeSelect}
      {action.type === "say" ? (
        <input
          data-testid={
            ruleIndex === 0 && actionIndex === 0
              ? "inspector-say"
              : `action-say-${ruleIndex}-${actionIndex}`
          }
          style={{ flex: 1, minWidth: 80 }}
          value={action.text}
          onChange={(e) => {
            const next: ExploreAction = { type: "say", text: e.target.value, speaker: action.speaker };
            onPatch(
              patchAction(allRules, ruleIndex, actionIndex, next),
              interactionCoalesceKey(hotspotId, on, ruleIndex, actionIndex, "say"),
            );
          }}
        />
      ) : null}
      {action.type === "setSwitch" ? (
        <>
          <select
            data-testid={`action-switch-id-${ruleIndex}-${actionIndex}`}
            value={action.id}
            onChange={(e) => {
              const next: ExploreAction = {
                type: "setSwitch",
                id: e.target.value,
                value: action.value,
              };
              onPatch(patchAction(allRules, ruleIndex, actionIndex, next));
            }}
          >
            <option value="">（揀開關）</option>
            {switches.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ? `${s.name} (${s.id})` : s.id}
              </option>
            ))}
            {action.id && !switches.some((s) => s.id === action.id) ? (
              <option value={action.id}>{action.id}（未知）</option>
            ) : null}
          </select>
          <select
            data-testid={`action-switch-val-${ruleIndex}-${actionIndex}`}
            value={action.value ? "true" : "false"}
            onChange={(e) => {
              const next: ExploreAction = {
                type: "setSwitch",
                id: action.id,
                value: e.target.value === "true",
              };
              onPatch(patchAction(allRules, ruleIndex, actionIndex, next));
            }}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </>
      ) : null}
      {action.type === "giveItem" ? (
        <select
          data-testid={`action-item-id-${ruleIndex}-${actionIndex}`}
          value={action.id}
          onChange={(e) => {
            const next: ExploreAction = { type: "giveItem", id: e.target.value };
            onPatch(patchAction(allRules, ruleIndex, actionIndex, next));
          }}
        >
          <option value="">（揀物品）</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name} ({it.id})
            </option>
          ))}
          {action.id && !items.some((i) => i.id === action.id) ? (
            <option value={action.id}>{action.id}（未知）</option>
          ) : null}
        </select>
      ) : null}
      <button
        type="button"
        data-testid={`action-remove-${ruleIndex}-${actionIndex}`}
        onClick={() => onPatch(removeAction(allRules, ruleIndex, actionIndex))}
      >
        ✕
      </button>
    </div>
  );
}

export interface HotspotInspectorProps {
  doc: ExploreDoc;
  hotspot: Hotspot;
  onUpdate: (patch: Partial<Hotspot>, coalesceKey?: string) => void;
}

/** Hotspot property panel: rename, defaultVerb, rect numbers. */
export function HotspotInspector({ doc, hotspot, onUpdate }: HotspotInspectorProps) {
  const verbs = doc.project.verbs;
  const shape = hotspot.shape;

  return (
    <div data-testid="hotspot-inspector" style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>熱區屬性</div>
      <label style={{ display: "block", marginBottom: 6 }}>
        名稱
        <input
          data-testid="hotspot-name"
          style={{ width: "100%", display: "block" }}
          value={hotspot.name}
          onChange={(e) =>
            onUpdate({ name: e.target.value }, `hs-name:${hotspot.id}`)
          }
        />
      </label>
      <label style={{ display: "block", marginBottom: 6 }}>
        ID（唯讀）
        <input
          data-testid="hotspot-id"
          style={{ width: "100%", display: "block", opacity: 0.7 }}
          value={hotspot.id}
          readOnly
        />
      </label>
      <label style={{ display: "block", marginBottom: 6 }}>
        預設動詞
        <select
          data-testid="hotspot-default-verb"
          style={{ width: "100%", display: "block" }}
          value={hotspot.defaultVerb ?? ""}
          onChange={(e) =>
            onUpdate({ defaultVerb: e.target.value || undefined })
          }
        >
          <option value="">（無）</option>
          {verbs.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} ({v.id})
            </option>
          ))}
        </select>
      </label>
      {shape.type === "rect" ? (
        <div
          data-testid="hotspot-rect"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}
        >
          {(
            [
              ["x", shape.x],
              ["y", shape.y],
              ["w", shape.w],
              ["h", shape.h],
            ] as const
          ).map(([key, val]) => (
            <label key={key}>
              {key}
              <input
                data-testid={`hotspot-rect-${key}`}
                type="number"
                style={{ width: "100%" }}
                value={val}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isNaN(n)) return;
                  onUpdate(
                    {
                      shape: {
                        type: "rect",
                        x: key === "x" ? n : shape.x,
                        y: key === "y" ? n : shape.y,
                        w: key === "w" ? n : shape.w,
                        h: key === "h" ? n : shape.h,
                      },
                    },
                    `hs-rect:${hotspot.id}:${key}`,
                  );
                }}
              />
            </label>
          ))}
        </div>
      ) : (
        <div style={{ opacity: 0.65 }}>多邊形熱區（座標稍後編輯）</div>
      )}
    </div>
  );
}
