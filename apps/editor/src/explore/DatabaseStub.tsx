import { uniqueId } from "./commands";
import type { ExploreDoc } from "./types";

export interface DatabaseStubProps {
  doc: ExploreDoc;
  onAddCharacter: (id: string, name: string) => void;
  onAddSwitch: (id: string, name: string) => void;
  onAddItem: (id: string, name: string) => void;
  onRemoveCharacter: (id: string) => void;
  onRemoveSwitch: (id: string) => void;
  onRemoveItem: (id: string) => void;
}

/** Minimal CRUD stub for characters / switches / items (M2). */
export function DatabaseStub({
  doc,
  onAddCharacter,
  onAddSwitch,
  onAddItem,
  onRemoveCharacter,
  onRemoveSwitch,
  onRemoveItem,
}: DatabaseStubProps) {
  return (
    <div className="database-stub" data-testid="database-stub" style={{ fontSize: 12 }}>
      <section>
        <h4>角色</h4>
        <ul>
          {doc.project.characters.map((c) => (
            <li key={c.id}>
              {c.id}{" "}
              <button type="button" onClick={() => onRemoveCharacter(c.id)}>
                刪
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          data-testid="db-add-character"
          onClick={() => {
            const taken = new Set(doc.project.characters.map((c) => c.id));
            const id = uniqueId("char", taken);
            onAddCharacter(id, id);
          }}
        >
          ＋角色
        </button>
      </section>
      <section>
        <h4>開關</h4>
        <ul>
          {doc.project.switches.map((s) => (
            <li key={s.id}>
              {s.id} ({s.name ?? ""}){" "}
              <button type="button" onClick={() => onRemoveSwitch(s.id)}>
                刪
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          data-testid="db-add-switch"
          onClick={() => {
            const taken = new Set(doc.project.switches.map((s) => s.id));
            const id = uniqueId("sw", taken);
            onAddSwitch(id, id);
          }}
        >
          ＋開關
        </button>
      </section>
      <section>
        <h4>物品</h4>
        <ul>
          {doc.project.items.map((i) => (
            <li key={i.id}>
              {i.name}{" "}
              <button type="button" onClick={() => onRemoveItem(i.id)}>
                刪
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          data-testid="db-add-item"
          onClick={() => {
            const taken = new Set(doc.project.items.map((i) => i.id));
            const id = uniqueId("item", taken);
            onAddItem(id, id);
          }}
        >
          ＋物品
        </button>
      </section>
    </div>
  );
}
