import { useId, useState, type ReactNode } from "react";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  optional?: boolean;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url";
  placeholder?: string;
}

export function TextField({ label, value, onChange, hint, error, optional, type = "text", autoComplete, inputMode, placeholder }: TextFieldProps) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const showError = touched && error;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label} {optional && <span className="optional">optional</span>}
      </label>
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={Boolean(showError)}
        aria-describedby={showError ? `${id}-err` : hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
      />
      {showError ? <p id={`${id}-err`} className="error">{error}</p> : hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  optional?: boolean;
}

export function NumberField({ label, value, onChange, prefix, suffix, hint, min = 0, max, step, optional }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(value == null ? "" : String(value));
  const [lastValue, setLastValue] = useState(value);
  // Keep the visible text in sync when the value changes from outside (e.g. document reading).
  if (value !== lastValue) {
    setLastValue(value);
    if (value !== parse(text)) setText(value == null ? "" : String(value));
  }
  function parse(s: string): number | null {
    const cleaned = s.replace(/[$,%\s]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  const n = parse(text);
  const error =
    text.trim() && n == null ? "Enter a number, like 12500." : n != null && n < min ? `Must be ${min} or more.` : n != null && max != null && n > max ? `Must be ${max} or less.` : "";
  const [touched, setTouched] = useState(false);
  const showError = touched && error;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label} {optional && <span className="optional">optional</span>}
      </label>
      <div className="affix">
        {prefix && <span className="affix-text" aria-hidden="true">{prefix}</span>}
        <input
          id={id}
          className="input"
          inputMode={step && step < 1 ? "decimal" : "numeric"}
          value={text}
          aria-invalid={Boolean(showError)}
          aria-describedby={showError ? `${id}-err` : hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const v = parse(e.target.value);
            if (v == null || (v >= min && (max == null || v <= max))) {
              setLastValue(v);
              onChange(v);
            }
          }}
          onBlur={() => setTouched(true)}
        />
        {suffix && <span className="affix-text" aria-hidden="true">{suffix}</span>}
      </div>
      {showError ? <p id={`${id}-err`} className="error">{error}</p> : hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  legend: ReactNode;
  name: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  compact?: boolean;
  hideLegend?: boolean;
}

export function Segmented<T extends string | number>({ legend, name, value, options, onChange, compact, hideLegend }: SegmentedProps<T>) {
  return (
    <fieldset className={`segmented-field ${compact ? "compact" : ""}`}>
      <legend className={hideLegend ? "sr-only" : "label"}>{legend}</legend>
      <div className="segmented">
        {options.map((o) => (
          <label key={String(o.value)} className={value === o.value ? "on" : ""}>
            <input type="radio" name={name} value={String(o.value)} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function StarRating({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const name = useId();
  return (
    <fieldset className="stars-field">
      <legend className="label">{label}</legend>
      <div className="stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={value != null && n <= value ? "on" : ""} title={`${n} of 5`}>
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              onClick={() => value === n && onChange(null)}
              aria-label={`${n} of 5`}
            />
            <span aria-hidden="true">★</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
