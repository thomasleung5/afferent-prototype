
import { useEffect, useState, type CSSProperties } from "react";

interface Props {
  value: number | string | null;
  onChange: (v: number | string) => void;
  /** "text": pass-through string editing.
   *  "number": native number input (spinners, no comma formatting).
   *  "integer": text input with thousands-separator formatting on blur,
   *  raw digits while focused. Use for non-currency integer fields
   *  (counts, hours, etc.).
   *  "currency": same formatting as "integer" plus the optional `prefix`
   *  ("$") rendered ahead of the value. */
  type?: "text" | "number" | "integer" | "currency";
  prefix?: string;
  suffix?: string;
  align?: "left" | "right" | "center";
  width?: number | string;
  dim?: boolean;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  fontSize?: number;
}

/** Format a number as US currency without decimal places. Matches
 *  fmt.dollars() rounding behavior so display is consistent. */
function formatCurrency(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Strip non-numeric characters so pasted "$1,234.56" or "1 234,56"
 *  parses cleanly. Keeps the leading minus sign and a single decimal. */
function parseCurrency(raw: string): number {
  const cleaned = raw.replace(/[^\d.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === "-.") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
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
  fontSize = 12.5,
}: Props) {
  const formatted = type === "currency" || type === "integer";
  const initialDraft = (() => {
    if (value == null || value === "") return "";
    if (formatted) {
      const n = Number(value);
      return Number.isFinite(n) ? formatCurrency(n) : "";
    }
    return String(value);
  })();
  const [draft, setDraft] = useState(initialDraft);
  const [focused, setFocused] = useState(false);

  // Sync from external value when not actively editing.
  useEffect(() => {
    if (focused) return;
    if (value == null || value === "") {
      setDraft("");
      return;
    }
    if (formatted) {
      const n = Number(value);
      setDraft(Number.isFinite(n) ? formatCurrency(n) : "");
    } else {
      setDraft(String(value));
    }
  }, [value, focused, formatted]);

  const affixFontSize = fontSize === 12.5 ? 11 : fontSize;
  const wrapStyle: CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 2,
    padding: "3px 6px",
    width: width ?? "100%",
    background: focused ? "var(--paper)" : "transparent",
    border: focused ? "1px solid var(--accent)" : "1px solid transparent",
    transition: "background 100ms, border-color 100ms",
  };

  const inputHtmlType = type === "number" ? "number" : "text";

  return (
    <span
      style={wrapStyle}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={(e) => { if (!focused) e.currentTarget.style.background = "var(--paper-2)"; }}
      onMouseLeave={(e) => { if (!focused) e.currentTarget.style.background = "transparent"; }}
    >
      {prefix && <span style={{ color: "var(--ink-3)", fontSize: affixFontSize, fontFamily: "var(--ff-mono)" }}>{prefix}</span>}
      <input
        type={inputHtmlType}
        inputMode={formatted ? "decimal" : undefined}
        value={draft}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          // Show raw digits while editing — easier to manipulate than the
          // formatted version, and avoids cursor-position complexity.
          if (formatted && value != null && value !== "") {
            const n = Number(value);
            if (Number.isFinite(n)) setDraft(String(Math.round(n)));
          }
          // Select all so a fresh number replaces the existing value cleanly.
          if (type === "number" || formatted) e.target.select();
        }}
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
          } else if (formatted) {
            let next = parseCurrency(draft);
            if (min != null) next = Math.max(min, next);
            if (max != null) next = Math.min(max, next);
            onChange(next);
            setDraft(formatCurrency(next));
          } else {
            onChange(draft);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            if (formatted && value != null && value !== "") {
              const n = Number(value);
              setDraft(Number.isFinite(n) ? formatCurrency(n) : "");
            } else {
              setDraft(value == null ? "" : String(value));
            }
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="num"
        style={{
          width: "100%",
          background: "transparent", border: 0, outline: "none",
          textAlign: align, fontSize,
          color: dim ? "var(--ink-3)" : "var(--ink)",
          fontFamily: "inherit", padding: 0,
        }}
      />
      {suffix && <span style={{ color: "var(--ink-3)", fontSize: affixFontSize, fontFamily: "var(--ff-mono)" }}>{suffix}</span>}
    </span>
  );
}
