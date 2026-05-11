"use client";

import { useEffect, useState, type CSSProperties } from "react";

interface Props {
  value: number | null;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  align?: "left" | "right";
  /** Compact = no border at rest, underline-on-focus. Used in tables. */
  compact?: boolean;
  width?: number;
  placeholder?: string;
  bold?: boolean;
}

/** Inline numeric editor used across Build screens. Calm at rest, underline on
 *  focus. Reports raw numbers via onChange; null/empty input emits 0. */
export function EditableNumber({
  value, onChange,
  prefix, suffix,
  step = 1, min, max,
  align = "right",
  compact = false,
  width,
  placeholder,
  bold = false,
}: Props) {
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    if (!focus) setDraft(value == null ? "" : String(value));
  }, [value, focus]);

  const commit = () => {
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
  };

  const wrap: CSSProperties = compact
    ? {
        display: "inline-flex", alignItems: "baseline", gap: 2,
        width: width ?? "100%", justifyContent: align === "right" ? "flex-end" : "flex-start",
      }
    : {
        display: "inline-flex", alignItems: "baseline", gap: 2,
        width: width ?? "100%",
        padding: "4px 8px",
        border: "1px solid var(--rule)",
        background: "var(--paper)",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
      };

  const inputStyle: CSSProperties = compact
    ? {
        width: width ? width - 12 : "100%",
        fontSize: 13, fontFamily: "var(--ff-mono)", fontWeight: bold ? 600 : 500,
        color: "var(--ink)",
        background: "transparent",
        border: 0, outline: 0,
        padding: "1px 0",
        textAlign: align,
        borderBottom: focus ? "1px solid var(--ink-2)" : "1px solid transparent",
        transition: "border-color 120ms",
      }
    : {
        width: "100%",
        fontSize: 13, fontFamily: "var(--ff-mono)", fontWeight: bold ? 600 : 500,
        color: "var(--ink)",
        background: "transparent",
        border: 0, outline: 0,
        textAlign: align,
      };

  return (
    <span style={wrap}>
      {prefix && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{prefix}</span>}
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); commit(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") {
            setDraft(value == null ? "" : String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        style={inputStyle}
        className="num"
      />
      {suffix && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{suffix}</span>}
    </span>
  );
}
