import { useState, type ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="v2-section">
      <h3 className="v2-section-title">{title}</h3>
      {children}
    </section>
  );
}

export function Fold({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`v2-fold${open ? " open" : ""}`}>
      <button
        type="button"
        className="v2-fold-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="v2-fold-title">{title}</span>
        {!open && summary ? <span className="v2-fold-summary">{summary}</span> : null}
      </button>
      {open ? <div className="v2-fold-body">{children}</div> : null}
    </section>
  );
}

export function Field({
  label,
  children,
  inline,
}: {
  label: string;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={inline ? "v2-field v2-field-inline" : "v2-field"}>
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="v2-seg" role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`v2-seg-btn${opt.value === value ? " active" : ""}`}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`v2-switch${checked ? " on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="v2-switch-knob" />
      <span className="v2-switch-label">{label}</span>
    </button>
  );
}
