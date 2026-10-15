import { clampRect } from "./canvas";
import {
  EDITABLE_ACTION_TYPES,
  actionChipLabel,
  addAction,
  addActionToList,
  addRule,
  addWhen,
  editableActionTypeLabel,
  emptySwitchPred,
  getCellRules,
  interactionCoalesceKey,
  isEditableAction,
  isEditablePred,
  moveRule,
  onEnterCoalesceKey,
  patchAction,
  patchActionInList,
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
  SceneCatalogEntry,
} from "./types";

export interface CellInspectorProps {
  doc: ExploreDoc;
  onChangeRules: (rules: InteractionRule[], coalesceKey?: string) => void;
  /** Scenes available for Call / Goto pickers. */
  sceneCatalog?: SceneCatalogEntry[];
}

/** Rule-card Inspector for a matrix cell — When/Do via GUI; never wipe unsupported. */
export function CellInspector({ doc, onChangeRules, sceneCatalog = [] }: CellInspectorProps) {
  const cell = doc.ui.selectedCell!;
  const rules = getCellRules(doc, cell.hotspotId, cell.on);
  const switches = doc.project.switches;
  const items = doc.project.items;
  const characters = doc.project.characters;
  const locale = doc.project.locale || "zh-Hant";
  const effectIds = (doc.project.effectLibrary ?? []).map((e) => e.id);
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
        <div style={{ opacity: 0.65, marginBottom: 8 }}>無規則（使用後備規則）</div>
      ) : null}
      {rules.map((rule, ri) => (
        <RuleCard
          key={ri}
          index={ri}
          rule={rule}
          switches={switches}
          items={items}
          characters={characters}
          locale={locale}
          hotspotId={cell.hotspotId}
          on={cell.on}
          sceneCatalog={sceneCatalog}
          effectIds={effectIds}
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
  characters,
  locale,
  hotspotId,
  on,
  sceneCatalog,
  effectIds,
  allRules,
  onPatch,
  onRemove,
}: {
  index: number;
  rule: InteractionRule;
  switches: ExploreDoc["project"]["switches"];
  items: ExploreDoc["project"]["items"];
  characters: ExploreDoc["project"]["characters"];
  locale: string;
  hotspotId: string;
  on: InteractionOn;
  sceneCatalog: SceneCatalogEntry[];
  effectIds: string[];
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
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
        <strong>規則 {index + 1}</strong>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            data-testid={`rule-up-${index}`}
            disabled={index === 0}
            title="上移"
            onClick={() => onPatch(moveRule(allRules, index, "up"))}
          >
            ↑
          </button>
          <button
            type="button"
            data-testid={`rule-down-${index}`}
            disabled={index >= allRules.length - 1}
            title="下移"
            onClick={() => onPatch(moveRule(allRules, index, "down"))}
          >
            ↓
          </button>
          <button type="button" data-testid={`rule-remove-${index}`} onClick={onRemove}>
            刪規則
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ opacity: 0.75, marginBottom: 4 }}>條件</div>
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
                <option value="">（選擇開關）</option>
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
                <option value="true">為真</option>
                <option value="false">為假</option>
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
              title="未支援的條件（只讀保留）"
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
        <div style={{ opacity: 0.75, marginBottom: 4 }}>動作</div>
        {rule.do.map((a, ai) =>
          isEditableAction(a) ? (
            <EditableActionRow
              key={ai}
              ruleIndex={index}
              actionIndex={ai}
              action={a}
              switches={switches}
              items={items}
              characters={characters}
              locale={locale}
              hotspotId={hotspotId}
              on={on}
              sceneCatalog={sceneCatalog}
              effectIds={effectIds}
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
              title="未支援的動作（只讀保留）"
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
              ＋{editableActionTypeLabel(t)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function emptyForType(
  t: EditableActionType,
  switches: ExploreDoc["project"]["switches"],
  items: ExploreDoc["project"]["items"],
  sceneCatalog: SceneCatalogEntry[],
  prev: ExploreAction,
): ExploreAction {
  switch (t) {
    case "say":
      return { type: "say", text: prev.type === "say" ? prev.text : "" };
    case "setSwitch":
      return {
        type: "setSwitch",
        id: prev.type === "setSwitch" ? prev.id : switches[0]?.id ?? "",
        value: prev.type === "setSwitch" ? prev.value : true,
      };
    case "giveItem":
      return {
        type: "giveItem",
        id: prev.type === "giveItem" ? prev.id : items[0]?.id ?? "",
      };
    case "takeItem":
      return {
        type: "takeItem",
        id:
          prev.type === "takeItem" || prev.type === "giveItem"
            ? prev.id
            : items[0]?.id ?? "",
      };
    case "call":
      return {
        type: "call",
        scene:
          prev.type === "call" || prev.type === "gotoScene"
            ? prev.scene
            : sceneCatalog.find((s) => s.kind === "dialogue")?.id ?? "",
        trans: prev.type === "call" || prev.type === "return" || prev.type === "gotoScene" ? prev.trans : undefined,
      };
    case "return":
      return {
        type: "return",
        trans: prev.type === "call" || prev.type === "return" || prev.type === "gotoScene" ? prev.trans : undefined,
      };
    case "gotoScene":
      return {
        type: "gotoScene",
        scene:
          prev.type === "call" || prev.type === "gotoScene"
            ? prev.scene
            : sceneCatalog[0]?.id ?? "",
        trans: prev.type === "call" || prev.type === "return" || prev.type === "gotoScene" ? prev.trans : undefined,
      };
  }
}

function TransSelect({
  testId,
  value,
  effectIds,
  onChange,
}: {
  testId: string;
  value?: string;
  effectIds: string[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <select
      data-testid={testId}
      value={value ?? ""}
      title="轉場（空＝用專案轉場預設）"
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">（預設）</option>
      {effectIds.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
      {value && !effectIds.includes(value) ? (
        <option value={value}>{value}（未知）</option>
      ) : null}
    </select>
  );
}

function SceneSelect({
  testId,
  value,
  sceneCatalog,
  onChange,
}: {
  testId: string;
  value: string;
  sceneCatalog: SceneCatalogEntry[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">（選擇場景）</option>
      {sceneCatalog.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title ? `${s.title} (${s.id})` : s.id}
          {s.kind === "dialogue" ? " ·對話" : " ·探險"}
          {s.kind === "dialogue" && s.hasReturn === false ? " ⚠無返回" : ""}
        </option>
      ))}
      {value && !sceneCatalog.some((s) => s.id === value) ? (
        <option value={value}>{value}（未知）</option>
      ) : null}
    </select>
  );
}

function EditableActionRow({
  ruleIndex,
  actionIndex,
  action,
  switches,
  items,
  characters,
  locale,
  hotspotId,
  on,
  sceneCatalog,
  effectIds,
  allRules,
  onPatch,
}: {
  ruleIndex: number;
  actionIndex: number;
  action: Extract<ExploreAction, { type: EditableActionType }>;
  switches: ExploreDoc["project"]["switches"];
  items: ExploreDoc["project"]["items"];
  characters: ExploreDoc["project"]["characters"];
  locale: string;
  hotspotId: string;
  on: InteractionOn;
  sceneCatalog: SceneCatalogEntry[];
  effectIds: string[];
  allRules: InteractionRule[];
  onPatch: (rules: InteractionRule[], coalesceKey?: string) => void;
}) {
  const typeSelect = (
    <select
      data-testid={`action-type-${ruleIndex}-${actionIndex}`}
      value={action.type}
      onChange={(e) => {
        const t = e.target.value as EditableActionType;
        const next = emptyForType(t, switches, items, sceneCatalog, action);
        onPatch(patchAction(allRules, ruleIndex, actionIndex, next));
      }}
    >
      {EDITABLE_ACTION_TYPES.map((t) => (
        <option key={t} value={t}>
          {editableActionTypeLabel(t)}
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
        <>
          <select
            data-testid={
              ruleIndex === 0 && actionIndex === 0
                ? "inspector-say-speaker"
                : `action-say-speaker-${ruleIndex}-${actionIndex}`
            }
            value={action.speaker ?? ""}
            title="說話者"
            onChange={(e) => {
              const speaker = e.target.value || undefined;
              const next: ExploreAction = {
                type: "say",
                text: action.text,
                speaker,
              };
              onPatch(patchAction(allRules, ruleIndex, actionIndex, next));
            }}
          >
            <option value="">（無說話者）</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {charLabel(c, locale)} ({c.id})
              </option>
            ))}
            {action.speaker && !characters.some((c) => c.id === action.speaker) ? (
              <option value={action.speaker}>{action.speaker}（未知）</option>
            ) : null}
          </select>
          <input
            data-testid={
              ruleIndex === 0 && actionIndex === 0
                ? "inspector-say"
                : `action-say-${ruleIndex}-${actionIndex}`
            }
            style={{ flex: 1, minWidth: 80 }}
            value={action.text}
            onChange={(e) => {
              const next: ExploreAction = {
                type: "say",
                text: e.target.value,
                speaker: action.speaker,
              };
              onPatch(
                patchAction(allRules, ruleIndex, actionIndex, next),
                interactionCoalesceKey(hotspotId, on, ruleIndex, actionIndex, "say"),
              );
            }}
          />
        </>
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
            <option value="">（選擇開關）</option>
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
            <option value="true">開啟</option>
            <option value="false">關閉</option>
          </select>
        </>
      ) : null}
      {action.type === "giveItem" || action.type === "takeItem" ? (
        <select
          data-testid={`action-item-id-${ruleIndex}-${actionIndex}`}
          value={action.id}
          onChange={(e) => {
            const next: ExploreAction =
              action.type === "giveItem"
                ? { type: "giveItem", id: e.target.value }
                : { type: "takeItem", id: e.target.value };
            onPatch(patchAction(allRules, ruleIndex, actionIndex, next));
          }}
        >
          <option value="">（選擇物品）</option>
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
      {action.type === "call" || action.type === "gotoScene" ? (
        <SceneSelect
          testId={`action-scene-${ruleIndex}-${actionIndex}`}
          value={action.scene}
          sceneCatalog={sceneCatalog}
          onChange={(scene) => {
            const next: ExploreAction =
              action.type === "call"
                ? { type: "call", scene, trans: action.trans }
                : { type: "gotoScene", scene, trans: action.trans };
            onPatch(patchAction(allRules, ruleIndex, actionIndex, next));
          }}
        />
      ) : null}
      {action.type === "call" || action.type === "return" || action.type === "gotoScene" ? (
        <TransSelect
          testId={`action-trans-${ruleIndex}-${actionIndex}`}
          value={action.trans}
          effectIds={effectIds}
          onChange={(trans) => {
            let next: ExploreAction;
            if (action.type === "call") next = { type: "call", scene: action.scene, trans };
            else if (action.type === "return") next = { type: "return", trans };
            else next = { type: "gotoScene", scene: action.scene, trans };
            onPatch(patchAction(allRules, ruleIndex, actionIndex, next));
          }}
        />
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


/** Shared When-style switch predicate rows (rules + hotspot visibleIf/enabledIf). */
function SwitchPredEditor({
  preds,
  switches,
  testIdPrefix,
  onChange,
}: {
  preds: Pred[];
  switches: ExploreDoc["project"]["switches"];
  testIdPrefix: string;
  onChange: (next: Pred[]) => void;
}) {
  const list = preds ?? [];
  return (
    <div data-testid={testIdPrefix}>
      {list.map((p, pi) =>
        isEditablePred(p) ? (
          <div
            key={pi}
            data-testid={`${testIdPrefix}-row-${pi}`}
            style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center" }}
          >
            <select
              data-testid={`${testIdPrefix}-switch-${pi}`}
              value={p.switch}
              onChange={(e) => {
                const next = list.map((x, i) =>
                  i === pi ? ({ switch: e.target.value, is: p.is } as Pred) : x,
                );
                onChange(next);
              }}
            >
              <option value="">（選擇開關）</option>
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
              data-testid={`${testIdPrefix}-is-${pi}`}
              value={p.is ? "true" : "false"}
              onChange={(e) => {
                const next = list.map((x, i) =>
                  i === pi
                    ? ({ switch: p.switch, is: e.target.value === "true" } as Pred)
                    : x,
                );
                onChange(next);
              }}
            >
              <option value="true">為真</option>
              <option value="false">為假</option>
            </select>
            <button
              type="button"
              data-testid={`${testIdPrefix}-remove-${pi}`}
              onClick={() => onChange(list.filter((_, i) => i !== pi))}
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            key={pi}
            data-testid={`${testIdPrefix}-readonly-${pi}`}
            style={{
              display: "inline-block",
              padding: "2px 6px",
              marginBottom: 4,
              marginRight: 4,
              background: "#333",
              borderRadius: 4,
              opacity: 0.85,
            }}
            title="未支援的條件（只讀保留）"
          >
            {predChipLabel(p)}
          </div>
        ),
      )}
      <button
        type="button"
        data-testid={`${testIdPrefix}-add`}
        onClick={() =>
          onChange([...list, emptySwitchPred(switches[0]?.id ?? "")])
        }
      >
        ＋條件
      </button>
    </div>
  );
}

function charLabel(
  c: ExploreDoc["project"]["characters"][number],
  locale: string,
): string {
  return c.display?.[locale] ?? c.display?.["zh-Hant"] ?? c.display?.en ?? c.id;
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
              ["x", "X", shape.x],
              ["y", "Y", shape.y],
              ["w", "寬", shape.w],
              ["h", "高", shape.h],
            ] as const
          ).map(([key, label, val]) => (
            <label key={key}>
              {label}
              <input
                data-testid={`hotspot-rect-${key}`}
                type="number"
                style={{ width: "100%" }}
                value={val}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isNaN(n)) return;
                  const next = clampRect(
                    {
                      x: key === "x" ? n : shape.x,
                      y: key === "y" ? n : shape.y,
                      w: key === "w" ? n : shape.w,
                      h: key === "h" ? n : shape.h,
                    },
                    doc.project.resolution,
                  );
                  onUpdate(
                    {
                      shape: {
                        type: "rect",
                        x: next.x,
                        y: next.y,
                        w: next.w,
                        h: next.h,
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
        <div style={{ opacity: 0.65 }} data-testid="hotspot-polygon-note">
          多邊形熱區：於畫布拖曳頂點調整形狀；雙擊邊可加點，Alt 點擊或 Delete 可刪點（至少保留三點）
        </div>
      )}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #333" }}>
        <div style={{ opacity: 0.75, marginBottom: 4 }}>顯示條件（visibleIf）</div>
        <SwitchPredEditor
          preds={hotspot.visibleIf ?? []}
          switches={doc.project.switches}
          testIdPrefix="hs-visibleIf"
          onChange={(next) =>
            onUpdate({ visibleIf: next.length ? next : null }, `hs-visibleIf:${hotspot.id}`)
          }
        />
      </div>
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #333" }}>
        <div style={{ opacity: 0.75, marginBottom: 4 }}>啟用條件（enabledIf）</div>
        <SwitchPredEditor
          preds={hotspot.enabledIf ?? []}
          switches={doc.project.switches}
          testIdPrefix="hs-enabledIf"
          onChange={(next) =>
            onUpdate({ enabledIf: next.length ? next : null }, `hs-enabledIf:${hotspot.id}`)
          }
        />
      </div>
    </div>
  );
}

export interface OnEnterInspectorProps {
  doc: ExploreDoc;
  sceneCatalog?: SceneCatalogEntry[];
  onChange: (actions: ExploreAction[], coalesceKey?: string) => void;
}

/** Scene-level onEnter action list — same editable types as rule Do. */
export function OnEnterInspector({
  doc,
  sceneCatalog = [],
  onChange,
}: OnEnterInspectorProps) {
  const actions = doc.scene.onEnter ?? [];
  const switches = doc.project.switches;
  const items = doc.project.items;
  const characters = doc.project.characters;
  const locale = doc.project.locale || "zh-Hant";
  const effectIds = (doc.project.effectLibrary ?? []).map((e) => e.id);
  const list = actions.length ? actions : [];

  const commit = (next: ExploreAction[], coalesceKey?: string) => {
    onChange(next, coalesceKey);
  };

  return (
    <div data-testid="on-enter-inspector" style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 6, fontWeight: 600 }}>入場動作</div>
      {list.length === 0 ? (
        <div style={{ opacity: 0.65, marginBottom: 6 }}>無（進入場景時不執行動作）</div>
      ) : null}
      {list.map((a, ai) =>
        isEditableAction(a) ? (
          <OnEnterActionRow
            key={ai}
            actionIndex={ai}
            action={a}
            switches={switches}
            items={items}
            characters={characters}
            locale={locale}
            sceneCatalog={sceneCatalog}
            effectIds={effectIds}
            allActions={list}
            onPatch={commit}
          />
        ) : (
          <div
            key={ai}
            data-testid={`onenter-readonly-${ai}`}
            style={{
              display: "inline-block",
              padding: "2px 6px",
              marginBottom: 4,
              marginRight: 4,
              background: "#333",
              borderRadius: 4,
              opacity: 0.85,
            }}
            title="未支援的動作（只讀保留）"
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
            data-testid={`onenter-add-${t}`}
            onClick={() => commit(addActionToList(list, t))}
          >
            ＋{editableActionTypeLabel(t)}
          </button>
        ))}
      </div>
    </div>
  );
}

function OnEnterActionRow({
  actionIndex,
  action,
  switches,
  items,
  characters,
  locale,
  sceneCatalog,
  effectIds,
  allActions,
  onPatch,
}: {
  actionIndex: number;
  action: Extract<ExploreAction, { type: EditableActionType }>;
  switches: ExploreDoc["project"]["switches"];
  items: ExploreDoc["project"]["items"];
  characters: ExploreDoc["project"]["characters"];
  locale: string;
  sceneCatalog: SceneCatalogEntry[];
  effectIds: string[];
  allActions: ExploreAction[];
  onPatch: (actions: ExploreAction[], coalesceKey?: string) => void;
}) {
  return (
    <div
      data-testid={`onenter-row-${actionIndex}`}
      style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center", flexWrap: "wrap" }}
    >
      <select
        data-testid={`onenter-type-${actionIndex}`}
        value={action.type}
        onChange={(e) => {
          const t = e.target.value as EditableActionType;
          const next = emptyForType(t, switches, items, sceneCatalog, action);
          onPatch(patchActionInList(allActions, actionIndex, next));
        }}
      >
        {EDITABLE_ACTION_TYPES.map((t) => (
          <option key={t} value={t}>
            {editableActionTypeLabel(t)}
          </option>
        ))}
      </select>
      {action.type === "say" ? (
        <>
          <select
            data-testid={`onenter-say-speaker-${actionIndex}`}
            value={action.speaker ?? ""}
            title="說話者"
            onChange={(e) => {
              const speaker = e.target.value || undefined;
              const next: ExploreAction = {
                type: "say",
                text: action.text,
                speaker,
              };
              onPatch(patchActionInList(allActions, actionIndex, next));
            }}
          >
            <option value="">（無說話者）</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {charLabel(c, locale)} ({c.id})
              </option>
            ))}
            {action.speaker && !characters.some((c) => c.id === action.speaker) ? (
              <option value={action.speaker}>{action.speaker}（未知）</option>
            ) : null}
          </select>
          <input
            data-testid={`onenter-say-${actionIndex}`}
            style={{ flex: 1, minWidth: 80 }}
            value={action.text}
            onChange={(e) => {
              const next: ExploreAction = {
                type: "say",
                text: e.target.value,
                speaker: action.speaker,
              };
              onPatch(
                patchActionInList(allActions, actionIndex, next),
                onEnterCoalesceKey(actionIndex, "say"),
              );
            }}
          />
        </>
      ) : null}
      {action.type === "setSwitch" ? (
        <>
          <select
            data-testid={`onenter-switch-id-${actionIndex}`}
            value={action.id}
            onChange={(e) => {
              const next: ExploreAction = {
                type: "setSwitch",
                id: e.target.value,
                value: action.value,
              };
              onPatch(patchActionInList(allActions, actionIndex, next));
            }}
          >
            <option value="">（選擇開關）</option>
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
            data-testid={`onenter-switch-val-${actionIndex}`}
            value={action.value ? "true" : "false"}
            onChange={(e) => {
              const next: ExploreAction = {
                type: "setSwitch",
                id: action.id,
                value: e.target.value === "true",
              };
              onPatch(patchActionInList(allActions, actionIndex, next));
            }}
          >
            <option value="true">開啟</option>
            <option value="false">關閉</option>
          </select>
        </>
      ) : null}
      {action.type === "giveItem" || action.type === "takeItem" ? (
        <select
          data-testid={`onenter-item-id-${actionIndex}`}
          value={action.id}
          onChange={(e) => {
            const next: ExploreAction =
              action.type === "giveItem"
                ? { type: "giveItem", id: e.target.value }
                : { type: "takeItem", id: e.target.value };
            onPatch(patchActionInList(allActions, actionIndex, next));
          }}
        >
          <option value="">（選擇物品）</option>
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
      {action.type === "call" || action.type === "gotoScene" ? (
        <SceneSelect
          testId={`onenter-scene-${actionIndex}`}
          value={action.scene}
          sceneCatalog={sceneCatalog}
          onChange={(scene) => {
            const next: ExploreAction =
              action.type === "call"
                ? { type: "call", scene, trans: action.trans }
                : { type: "gotoScene", scene, trans: action.trans };
            onPatch(patchActionInList(allActions, actionIndex, next));
          }}
        />
      ) : null}
      {action.type === "call" || action.type === "return" || action.type === "gotoScene" ? (
        <TransSelect
          testId={`onenter-trans-${actionIndex}`}
          value={action.trans}
          effectIds={effectIds}
          onChange={(trans) => {
            let next: ExploreAction;
            if (action.type === "call") next = { type: "call", scene: action.scene, trans };
            else if (action.type === "return") next = { type: "return", trans };
            else next = { type: "gotoScene", scene: action.scene, trans };
            onPatch(patchActionInList(allActions, actionIndex, next));
          }}
        />
      ) : null}
      <button
        type="button"
        data-testid={`onenter-remove-${actionIndex}`}
        onClick={() =>
          onPatch(allActions.filter((_, i) => i !== actionIndex))
        }
      >
        ✕
      </button>
    </div>
  );
}
