import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ACTIVITIES, type ActivityOption } from "@/lib/data/activities";

interface Props {
  value: ActivityOption | undefined;
  onChange: (next: ActivityOption) => void;
  placeholder?: string;
}

type Mode = "list" | "custom";

/** Searchable dropdown for the canonical activity catalog, with an
 *  inline "Custom..." text-input flow for unmapped values. Mirrors
 *  the UnitCombobox shape — same keyboard nav, same aesthetic. */
export function ActivityCombobox({ value, onChange, placeholder = "Select activity…" }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("list");
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [customText, setCustomText] = useState("");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const customRef = useRef<HTMLInputElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ACTIVITIES;
    return ACTIVITIES.filter((a) => a.label.toLowerCase().includes(q));
  }, [query]);

  // Measure the trigger so the portal'd panel can position itself in
  // viewport coords. Re-measure on scroll/resize so the panel stays
  // pinned even when the table scrolls underneath it.
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({ top: rect.bottom + 2, left: rect.left, width: rect.width });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  // Close on click outside — checks both the trigger and the portal'd
  // panel since they're no longer in the same DOM subtree.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = triggerRef.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (!inTrigger && !inPanel) close();
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

  function pick(option: ActivityOption) {
    onChange(option);
    close();
  }

  function startCustom() {
    setMode("custom");
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

  const panel = open && anchor && createPortal(
    <div
      ref={panelRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed", top: anchor.top, left: anchor.left, zIndex: 50,
        minWidth: Math.max(200, anchor.width), maxWidth: 320,
        background: "var(--paper)",
        border: "1px solid var(--rule-strong)",
        boxShadow: "0 6px 18px rgba(29,34,54,0.08)",
      }}
    >
          {mode === "list" && (
            <>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKeyDown}
                placeholder="Search activities…"
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
                {filtered.map((a, i) => {
                  const isHi = i === highlight;
                  const isSelected = value?.label === a.label && value?.type === a.type;
                  return (
                    <button
                      key={a.label}
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pick(a)}
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
                      {a.label}
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
              }}>Custom activity</div>
              <input
                ref={customRef}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={onCustomKeyDown}
                placeholder="e.g. Site Walk"
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
    </div>,
    document.body,
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
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
      {panel}
    </>
  );
}
