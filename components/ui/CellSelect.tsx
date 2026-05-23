
import { useState, type CSSProperties } from "react";

interface Option { value: string; label?: string }

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: (string | Option)[];
  width?: number | string;
  align?: "left" | "right";
}

/** Inline table-cell select. Border-less at rest, accent border on focus. */
export function CellSelect({ value, onChange, options, width, align = "left" }: Props) {
  const [focused, setFocused] = useState(false);
  const opts: Option[] = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));

  const style: CSSProperties = {
    padding: "3px 4px",
    fontSize: "var(--t-l7)", fontFamily: "var(--ff-ui)",
    border: focused ? "1px solid var(--accent)" : "1px solid transparent",
    background: focused ? "var(--paper)" : "transparent",
    width: width ?? "100%",
    color: "var(--ink)",
    textAlign: align,
    transition: "background 100ms, border-color 100ms",
  };

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={style}
    >
      {opts.map((o) => (
        <option key={o.value} value={o.value}>{o.label ?? o.value}</option>
      ))}
    </select>
  );
}
