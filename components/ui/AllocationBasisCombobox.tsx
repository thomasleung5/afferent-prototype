import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { AllocationBasis } from "@/lib/types";

interface Props {
  bases: AllocationBasis[];
  selectedId: string;
  /** Shown when selectedId doesn't resolve to a catalog entry (legacy pool). */
  fallbackText?: string;
  onSelect: (basisId: string, basisName: string) => void;
  onCreate: (input: { name: string; source: string; methodologyNote?: string }) => string;
}

type Mode = "list" | "create";

/** Inline combobox for picking an allocation basis from the catalog, with an
 *  inline "Create new basis…" mini-form. Spreadsheet aesthetic: no rounded
 *  corners, no pills, dense rows, keyboard-first. */
export function AllocationBasisCombobox({
  bases, selectedId, fallbackText, onSelect, onCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("list");
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [newName, setNewName] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newNote, setNewNote] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const selected = bases.find((b) => b.id === selectedId);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bases;
    return bases.filter((b) =>
      b.name.toLowerCase().includes(q) || b.source.toLowerCase().includes(q),
    );
  }, [bases, query]);

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

  // Reset highlight when the filtered set changes.
  useEffect(() => { setHighlight(0); }, [query]);

  // Focus the right input when entering each mode.
  useEffect(() => {
    if (!open) return;
    if (mode === "list") searchRef.current?.focus();
    if (mode === "create") nameRef.current?.focus();
  }, [open, mode]);

  function close() {
    setOpen(false);
    setMode("list");
    setQuery("");
    setHighlight(0);
    setNewName("");
    setNewSource("");
    setNewNote("");
  }

  function pick(b: AllocationBasis) {
    onSelect(b.id, b.name);
    close();
  }

  function submitCreate() {
    const name = newName.trim();
    const source = newSource.trim();
    if (!name || !source) return;
    const id = onCreate({ name, source, methodologyNote: newNote.trim() || undefined });
    onSelect(id, name);
    close();
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
      else setMode("create");
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function onCreateKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitCreate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMode("list");
    }
  }

  // ── render ──
  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Cell display (idle) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "block", width: "100%", textAlign: "left",
          padding: "2px 4px",
          background: "transparent", border: "1px solid transparent",
          cursor: "pointer", borderRadius: 0,
        }}
        onFocus={(e) => { e.currentTarget.style.background = "var(--paper-2)"; }}
        onBlur={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ fontSize: "var(--t-l7)", color: "var(--ink-2)", lineHeight: 1.4 }}>
          {selected?.name ?? fallbackText ?? <span style={{ color: "var(--ink-4)" }}>Select basis…</span>}
        </div>
        {selected?.source && (
          <div className="mono" style={{
            fontSize: "var(--t-l9)", color: "var(--ink-4)", lineHeight: 1.3, marginTop: 1,
          }}>{selected.source}</div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 2px)", left: 0, zIndex: 30,
          minWidth: 280, maxWidth: 360,
          background: "var(--paper)",
          border: "1px solid var(--rule-strong)",
          boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
        }}>
          {mode === "list" && (
            <>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKeyDown}
                placeholder="Search bases…"
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
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {filtered.length === 0 && (
                  <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--ink-3)" }}>
                    No matches.
                  </div>
                )}
                {filtered.map((b, i) => {
                  const isHi = i === highlight;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pick(b)}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "6px 10px",
                        background: isHi ? "var(--paper-2)" : "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--rule)",
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                    >
                      <div style={{ fontSize: "var(--t-l7)", color: "var(--ink)", lineHeight: 1.3 }}>
                        {b.name}
                      </div>
                      <div className="mono" style={{
                        fontSize: "var(--t-l9)", color: "var(--ink-4)", marginTop: 1, lineHeight: 1.3,
                      }}>{b.source}</div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onMouseEnter={() => setHighlight(filtered.length)}
                onClick={() => setMode("create")}
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
                + Create new basis…
              </button>
            </>
          )}

          {mode === "create" && (
            <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="mono" style={{
                fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
                color: "var(--ink-3)", textTransform: "uppercase",
              }}>New allocation basis</div>

              <CreateField label="Name" required>
                <input
                  ref={nameRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={onCreateKeyDown}
                  placeholder="e.g. Service request count"
                  style={fieldStyle}
                />
              </CreateField>

              <CreateField label="Source" required>
                <input
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  onKeyDown={onCreateKeyDown}
                  placeholder="e.g. 311 system export"
                  style={fieldStyle}
                />
              </CreateField>

              <CreateField label="Methodology note">
                <input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={onCreateKeyDown}
                  placeholder="optional"
                  style={fieldStyle}
                />
              </CreateField>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
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
                  onClick={submitCreate}
                  disabled={!newName.trim() || !newSource.trim()}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12, fontWeight: 500,
                    color: newName.trim() && newSource.trim() ? "var(--accent)" : "var(--ink-4)",
                    background: "var(--paper)",
                    border: `1px dashed ${newName.trim() && newSource.trim() ? "var(--accent)" : "var(--rule-strong)"}`,
                    cursor: newName.trim() && newSource.trim() ? "pointer" : "not-allowed",
                    borderRadius: 0,
                  }}
                >Add basis</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const fieldStyle = {
  display: "block",
  width: "100%",
  padding: "4px 6px",
  fontSize: 12, fontFamily: "var(--ff-ui)",
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  color: "var(--ink)",
  outline: "none",
  borderRadius: 0,
  boxSizing: "border-box" as const,
};

function CreateField({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div className="mono" style={{
        fontSize: "var(--t-l9)", color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        {label}{required && <span style={{ color: "var(--accent)" }}> *</span>}
      </div>
      {children}
    </div>
  );
}
