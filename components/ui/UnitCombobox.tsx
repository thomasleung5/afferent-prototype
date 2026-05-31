import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FEE_UNITS, type FeeUnitOption } from "@/lib/data/feeUnits";

interface Props {
  value: FeeUnitOption | undefined;
  onChange: (next: FeeUnitOption) => void;
  placeholder?: string;
}

type Mode = "list" | "custom";

/** Searchable dropdown for the canonical fee-unit catalog, with an
 *  inline "Custom..." text-input flow for unmapped values. Mirrors the
 *  spreadsheet aesthetic used by AllocationBasisCombobox: no rounded
 *  corners, dense rows, keyboard-first. */
export function UnitCombobox({ value, onChange, placeholder = "Select unit…" }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("list");
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [customText, setCustomText] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const customRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FEE_UNITS;
    return FEE_UNITS.filter((u) => u.label.toLowerCase().includes(q));
  }, [query]);

  // Close on click outside.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => { setHighlight(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    if (mode === "list") searchRef.current?.focus();
    if (mode === "custom") customRef.current?.focus();
  }, [open, mode]);

  function close() {
    setOpen(false);
    setMode("list");
    setQuery("");
    setHighlight(0);
    setCustomText("");
  }

  function pick(option: FeeUnitOption) {
    onChange(option);
    close();
  }

  function startCustom() {
    setMode("custom");
    // Seed the custom input with the current value when it's already
    // a CUSTOM entry, so the user can edit rather than retype.
    setCustomText(value?.type === "CUSTOM" ? value.label : "");
  }

  function commitCustom() {
    const label = customText.trim();
    if (!label) return;
    pick({ label, type: "CUSTOM" });
  }

  function onListKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight < filtered.length) pick(filtered[highlight]);
      else startCustom();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function onCustomKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitCustom();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMode("list");
    }
  }

  const labelText = value?.label;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onClickCapture={(e) => e.stopPropagation()}
        style={{
          display: "block", width: "100%", textAlign: "left",
          padding: "2px 4px",
          background: "transparent", border: "1px solid transparent",
          cursor: "pointer", borderRadius: 0,
          fontFamily: "var(--ff-ui)",
        }}
        onFocus={(e) => { e.currentTarget.style.background = "var(--paper-2)"; }}
        onBlur={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{
          fontSize: "var(--t-l7)",
          color: labelText ? "var(--ink)" : "var(--ink-4)",
        }}>
          {labelText ?? placeholder}
        </span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 2px)", left: 0, zIndex: 30,
          minWidth: 200, maxWidth: 280,
          background: "var(--paper)",
          border: "1px solid var(--rule-strong)",
          boxShadow: "0 6px 18px rgba(29,34,54,0.08)",
        }}>
          {mode === "list" && (
            <>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKeyDown}
                placeholder="Search units…"
                style={{
                  display: "block", width: "100%",
                  padding: "6px 10px",
                  background: "var(--paper)",
                  border: "none",
                  borderBottom: "1px solid var(--rule)",
                  fontSize: 12, fontFamily: "var(--ff-ui)",
                  color: "var(--ink)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {filtered.length === 0 && (
                  <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--ink-3)" }}>
                    No matches.
                  </div>
                )}
                {filtered.map((u, i) => {
                  const isHi = i === highlight;
                  const isSelected = value?.label === u.label && value?.type === u.type;
                  return (
                    <button
                      key={u.label}
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pick(u)}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "6px 10px",
                        background: isHi ? "var(--paper-2)" : "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--rule)",
                        cursor: "pointer",
                        fontSize: "var(--t-l7)", fontFamily: "var(--ff-ui)",
                        color: "var(--ink)",
                        fontWeight: isSelected ? 600 : 400,
                        boxSizing: "border-box",
                      }}
                    >
                      {u.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onMouseEnter={() => setHighlight(filtered.length)}
                onClick={startCustom}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "6px 10px",
                  background: highlight === filtered.length ? "var(--paper-2)" : "var(--paper-2)",
                  border: "none",
                  borderTop: "1px dashed var(--rule-strong)",
                  fontSize: 12, fontWeight: 500, color: "var(--accent)",
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
              >
                Custom…
              </button>
            </>
          )}

          {mode === "custom" && (
            <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="mono" style={{
                fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
                color: "var(--ink-3)", textTransform: "uppercase",
              }}>Custom unit</div>
              <input
                ref={customRef}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={onCustomKeyDown}
                placeholder="e.g. Cubic Yard"
                style={{
                  display: "block", width: "100%",
                  padding: "4px 6px",
                  fontSize: 12, fontFamily: "var(--ff-ui)",
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  color: "var(--ink)",
                  outline: "none",
                  borderRadius: 0,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12, color: "var(--ink-3)",
                    background: "transparent", border: "1px solid var(--rule)",
                    cursor: "pointer", borderRadius: 0,
                  }}
                >Cancel</button>
                <button
                  type="button"
                  onClick={commitCustom}
                  disabled={!customText.trim()}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12, fontWeight: 500,
                    color: customText.trim() ? "var(--accent)" : "var(--ink-4)",
                    background: "var(--paper)",
                    border: `1px dashed ${customText.trim() ? "var(--accent)" : "var(--rule-strong)"}`,
                    cursor: customText.trim() ? "pointer" : "not-allowed",
                    borderRadius: 0,
                  }}
                >Save</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
