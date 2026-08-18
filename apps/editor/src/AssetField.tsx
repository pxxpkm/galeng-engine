import { useId } from "react";
import { AuditionButton } from "./AuditionButton";
import { isMissingAsset } from "./assets";

export function AssetField({
  value,
  options,
  onChange,
  t,
  placeholder,
  disabled,
  warn = true,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  t: (key: string) => string;
  placeholder?: string;
  disabled?: boolean;
  warn?: boolean;
}) {
  const listId = useId();
  const missing = warn && isMissingAsset(value, options);
  return (
    <div className="asset-field">
      <div className="asset-field-row">
        <input
          type="text"
          list={listId}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <AuditionButton logical={value} t={t} />
      </div>
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {missing ? <div className="asset-missing">{t("editor.assetMissing")}</div> : null}
    </div>
  );
}
