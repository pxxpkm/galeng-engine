import { gotoOptions } from "./goto";
import type { SceneMeta } from "./types";

export function GotoSelect({
  scenes,
  value,
  onChange,
  onNew,
  label,
  newLabel,
}: {
  scenes: SceneMeta[];
  value: string;
  onChange: (id: string) => void;
  onNew?: () => void;
  label: string;
  newLabel?: string;
}) {
  const options = gotoOptions(scenes, value);
  return (
    <>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      {onNew && newLabel ? (
        <button type="button" onClick={onNew}>
          {newLabel}
        </button>
      ) : null}
    </>
  );
}
