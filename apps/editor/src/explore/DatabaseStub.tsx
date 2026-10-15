import { useState } from "react";
import { uniqueId } from "./commands";
import {
  confirmDeleteCharacterMessage,
  confirmDeleteItemMessage,
  confirmDeleteSwitchMessage,
  countCharacterRefs,
  countItemRefs,
  countSwitchRefs,
  defaultConfirmFn,
  type ConfirmFn,
} from "./refCounts";
import type { ExploreDoc, ItemDef } from "./types";

export interface DatabaseStubProps {
  doc: ExploreDoc;
  onAddCharacter: (id: string, name: string) => void;
  onAddSwitch: (id: string, name: string) => void;
  onAddItem: (id: string, name: string) => void;
  onRemoveCharacter: (id: string) => void;
  onRemoveSwitch: (id: string) => void;
  onRemoveItem: (id: string) => void;
  onUpdateCharacter?: (id: string, name: string) => void;
  onUpdateSwitch?: (id: string, name: string) => void;
  onUpdateItem?: (id: string, patch: Partial<ItemDef>) => void;
  /** Inject for tests; defaults to window.confirm. */
  confirmFn?: ConfirmFn;
}

function charDisplayName(c: ExploreDoc["project"]["characters"][number], locale: string): string {
  return c.display?.[locale] ?? c.display?.["zh-Hant"] ?? c.display?.["en"] ?? "";
}


function RefBadge({ count, testId }: { count: number; testId: string }) {
  if (count <= 0) return null;
  return (
    <span
      data-testid={testId}
      style={{ opacity: 0.65, fontSize: 11, whiteSpace: "nowrap" }}
      title="目前場景引用次數"
    >
      引用 {count}
    </span>
  );
}

/** Minimal CRUD stub for characters / switches / items (M2 + D0-A fields). */
export function DatabaseStub({
  doc,
  onAddCharacter,
  onAddSwitch,
  onAddItem,
  onRemoveCharacter,
  onRemoveSwitch,
  onRemoveItem,
  onUpdateCharacter,
  onUpdateSwitch,
  onUpdateItem,
  confirmFn = defaultConfirmFn,
}: DatabaseStubProps) {
  const locale = doc.project.locale || "zh-Hant";
  const [charId, setCharId] = useState("");
  const [charName, setCharName] = useState("");
  const [swId, setSwId] = useState("");
  const [swName, setSwName] = useState("");
  const [itemId, setItemId] = useState("");
  const [itemName, setItemName] = useState("");
  const [createError, setCreateError] = useState("");

  return (
    <div className="database-stub" data-testid="database-stub" style={{ fontSize: 12 }}>
      {createError ? (
        <div data-testid="db-create-error" style={{ color: "#e88", marginBottom: 6 }}>
          {createError}
        </div>
      ) : null}

      <section>
        <h4>角色</h4>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {doc.project.characters.map((c) => {
            const refs = countCharacterRefs(doc, c.id);
            return (
              <li
                key={c.id}
                data-testid={`db-char-row-${c.id}`}
                style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}
              >
                <code style={{ opacity: 0.75 }}>{c.id}</code>
                <input
                  data-testid={`db-char-name-${c.id}`}
                  style={{ flex: 1, minWidth: 60 }}
                  value={charDisplayName(c, locale)}
                  placeholder="名稱"
                  onChange={(e) => onUpdateCharacter?.(c.id, e.target.value)}
                  disabled={!onUpdateCharacter}
                />
                <RefBadge count={refs} testId={`db-char-refs-${c.id}`} />
                <button
                  type="button"
                  data-testid={`db-char-remove-${c.id}`}
                  onClick={() => {
                    if (!confirmFn(confirmDeleteCharacterMessage(c.id, refs))) return;
                    onRemoveCharacter(c.id);
                  }}
                >
                  刪
                </button>
              </li>
            );
          })}
        </ul>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
          <input
            data-testid="db-new-char-id"
            placeholder="id（可空＝自動）"
            value={charId}
            onChange={(e) => setCharId(e.target.value)}
            style={{ width: 110 }}
          />
          <input
            data-testid="db-new-char-name"
            placeholder="名稱"
            value={charName}
            onChange={(e) => setCharName(e.target.value)}
            style={{ width: 110 }}
          />
          <button
            type="button"
            data-testid="db-add-character"
            onClick={() => {
              const taken = new Set(doc.project.characters.map((c) => c.id));
              const raw = charId.trim();
              if (raw && taken.has(raw)) {
                setCreateError(`角色 id「${raw}」已存在`);
                return;
              }
              const id = raw || uniqueId("char", taken);
              const name = charName.trim() || id;
              setCreateError("");
              onAddCharacter(id, name);
              setCharId("");
              setCharName("");
            }}
          >
            ＋角色
          </button>
        </div>
      </section>

      <section>
        <h4>開關</h4>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {doc.project.switches.map((s) => {
            const refs = countSwitchRefs(doc, s.id);
            return (
              <li
                key={s.id}
                data-testid={`db-switch-row-${s.id}`}
                style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}
              >
                <code style={{ opacity: 0.75 }}>{s.id}</code>
                <input
                  data-testid={`db-switch-name-${s.id}`}
                  style={{ flex: 1, minWidth: 60 }}
                  value={s.name ?? ""}
                  placeholder="名稱"
                  onChange={(e) => onUpdateSwitch?.(s.id, e.target.value)}
                  disabled={!onUpdateSwitch}
                />
                <RefBadge count={refs} testId={`db-switch-refs-${s.id}`} />
                <button
                  type="button"
                  data-testid={`db-switch-remove-${s.id}`}
                  onClick={() => {
                    if (!confirmFn(confirmDeleteSwitchMessage(s.id, refs))) return;
                    onRemoveSwitch(s.id);
                  }}
                >
                  刪
                </button>
              </li>
            );
          })}
        </ul>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
          <input
            data-testid="db-new-switch-id"
            placeholder="id（可空＝自動）"
            value={swId}
            onChange={(e) => setSwId(e.target.value)}
            style={{ width: 110 }}
          />
          <input
            data-testid="db-new-switch-name"
            placeholder="名稱"
            value={swName}
            onChange={(e) => setSwName(e.target.value)}
            style={{ width: 110 }}
          />
          <button
            type="button"
            data-testid="db-add-switch"
            onClick={() => {
              const taken = new Set(doc.project.switches.map((s) => s.id));
              const raw = swId.trim();
              if (raw && taken.has(raw)) {
                setCreateError(`開關 id「${raw}」已存在`);
                return;
              }
              const id = raw || uniqueId("sw", taken);
              const name = swName.trim() || id;
              setCreateError("");
              onAddSwitch(id, name);
              setSwId("");
              setSwName("");
            }}
          >
            ＋開關
          </button>
        </div>
      </section>

      <section>
        <h4>物品</h4>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {doc.project.items.map((i) => {
            const refs = countItemRefs(doc, i.id);
            return (
            <li
              key={i.id}
              data-testid={`db-item-row-${i.id}`}
              style={{
                display: "flex",
                gap: 4,
                alignItems: "center",
                marginBottom: 6,
                flexWrap: "wrap",
              }}
            >
              <code style={{ opacity: 0.75 }}>{i.id}</code>
              <input
                data-testid={`db-item-name-${i.id}`}
                style={{ flex: 1, minWidth: 60 }}
                value={i.name}
                placeholder="名稱"
                onChange={(e) => onUpdateItem?.(i.id, { name: e.target.value })}
                disabled={!onUpdateItem}
              />
              <label style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                <input
                  type="checkbox"
                  data-testid={`db-item-consume-${i.id}`}
                  checked={!!i.consumeOnUse}
                  disabled={!onUpdateItem}
                  onChange={(e) =>
                    onUpdateItem?.(i.id, { consumeOnUse: e.target.checked })
                  }
                />
                用完消耗
              </label>
              <input
                data-testid={`db-item-icon-${i.id}`}
                style={{ width: 100 }}
                value={i.icon ?? ""}
                placeholder="icon"
                disabled={!onUpdateItem}
                onChange={(e) =>
                  onUpdateItem?.(i.id, { icon: e.target.value || undefined })
                }
              />
              <RefBadge count={refs} testId={`db-item-refs-${i.id}`} />
              <button
                type="button"
                data-testid={`db-item-remove-${i.id}`}
                onClick={() => {
                  if (!confirmFn(confirmDeleteItemMessage(i.id, refs))) return;
                  onRemoveItem(i.id);
                }}
              >
                刪
              </button>
            </li>
            );
          })}
        </ul>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
          <input
            data-testid="db-new-item-id"
            placeholder="id（可空＝自動）"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            style={{ width: 110 }}
          />
          <input
            data-testid="db-new-item-name"
            placeholder="名稱"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            style={{ width: 110 }}
          />
          <button
            type="button"
            data-testid="db-add-item"
            onClick={() => {
              const taken = new Set(doc.project.items.map((it) => it.id));
              const raw = itemId.trim();
              if (raw && taken.has(raw)) {
                setCreateError(`物品 id「${raw}」已存在`);
                return;
              }
              const id = raw || uniqueId("item", taken);
              const name = itemName.trim() || id;
              setCreateError("");
              onAddItem(id, name);
              setItemId("");
              setItemName("");
            }}
          >
            ＋物品
          </button>
        </div>
      </section>
    </div>
  );
}
