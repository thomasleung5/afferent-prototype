
import { useEffect, useState, type CSSProperties } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  compact?: boolean;
  bold?: boolean;
  width?: number;
}

/** Inline text editor — underline-on-focus, blank chrome at rest. */
export function EditableText({
  value, onChange,
  placeholder,
  compact = false,
  bold = false,
  width,
}: Props) {
  const [draft, setDraft] = useState(value);
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    if (!focus) setDraft(value);
  }, [value, focus]);

  const inputStyle: CSSProperties = compact
    ? {
        width: width ?? "100%",
        fontSize: 13, color: "var(--ink)", fontWeight: bold ? 600 : 400,
        background: "transparent",
        border: 0, outline: 0,
        padding: "2px 0",
        borderBottom: focus ? "1px solid var(--ink-2)" : "1px solid transparent",
        transition: "border-color 120ms",
      }
    : {
        width: width ?? "100%",
        fontSize: 13, color: "var(--ink)", fontWeight: bold ? 600 : 400,
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        outline: 0,
        padding: "5px 8px",
      };

  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => { setFocus(false); onChange(draft); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      style={inputStyle}
    />
  );
}
