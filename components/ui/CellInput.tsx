
import { useEffect, useState, type CSSProperties } from "react";

interface Props {
  value: number | string | null;
  onChange: (v: number | string) => void;
  type?: "text" | "number";
  prefix?: string;
  suffix?: string;
  align?: "left" | "right" | "center";
  width?: number | string;
  dim?: boolean;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
}

/** Inline-flat-until-focus table cell editor. Hover lifts the row chrome;
 *  focus reveals an accent border. Numbers commit on blur/Enter. */
export function CellInput({
  value, onChange,
  type = "text",
  prefix, suffix,
  align = "left",
  width,
  dim = false,
  step, min, max,
  placeholder,
}: Props) {
  const initial = value == null ? "" : String(value);
  const [draft, setDraft] = useState(initial);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value == null ? "" : String(value));
  }, [value, focused]);

  const wrapStyle: CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 2,
    padding: "3px 6px",
    width: width ?? "100%",
    background: focused ? "var(--paper)" : "transparent",
    border: focused ? "1px solid var(--accent)" : "1px solid transparent",
    transition: "background 100ms, border-color 100ms",
  };

  return (
    <span
      style={wrapStyle}
      onMouseEnter={(e) => { if (!focused) e.currentTarget.style.background = "var(--paper-2)"; }}
      onMouseLeave={(e) => { if (!focused) e.currentTarget.style.background = "transparent"; }}
    >
      {prefix && <span style={{ color: "var(--ink-3)", fontSize: 11, fontFamily: "var(--ff-mono)" }}>{prefix}</span>}
      <input
        type={type === "number" ? "number" : "text"}
        value={draft}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (type === "number") {
            const n = draft === "" ? 0 : Number(draft);
            if (Number.isFinite(n)) {
              let next = n;
              if (min != null) next = Math.max(min, next);
              if (max != null) next = Math.min(max, next);
              onChange(next);
              setDraft(String(next));
            } else {
              setDraft(value == null ? "" : String(value));
            }
          } else {
            onChange(draft);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value == null ? "" : String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="num"
        style={{
          width: "100%",
          background: "transparent", border: 0, outline: "none",
          textAlign: align, fontSize: 12.5,
          color: dim ? "var(--ink-3)" : "var(--ink)",
          fontFamily: "inherit", padding: 0,
        }}
      />
      {suffix && <span style={{ color: "var(--ink-3)", fontSize: 11, fontFamily: "var(--ff-mono)" }}>{suffix}</span>}
    </span>
  );
}
