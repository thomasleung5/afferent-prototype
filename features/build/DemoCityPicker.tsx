import { useEffect, useRef, useState } from "react";
import { Btn } from "@/components/ui";
import { switchJurisdiction, useActiveJurisdiction } from "@/lib/active";
import { JURISDICTIONS, type Jurisdiction } from "@/lib/data/jurisdictions";

/** "Load Demo City" affordance on the Build Model overview. Lets the
 *  user swap into a different city workspace without surfacing
 *  jurisdiction switching in the primary chrome — reads as workspace
 *  tooling, not a tenant selector.
 *
 *  Inline popover anchored to the button (same interaction shape as
 *  ExportMenu). Closes on outside click + ESC. */
export function DemoCityPicker() {
  const active = useActiveJurisdiction();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSelect(j: Jurisdiction) {
    if (!j.dataAvailable || j.id === active.id) {
      setOpen(false);
      return;
    }
    setOpen(false);
    setWorking(true);
    try { await switchJurisdiction(j.id); }
    finally { setWorking(false); }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <Btn
        kind="ghost"
        onClick={() => setOpen((o) => !o)}
        disabled={working}
        aria-expanded={open}
        title="Switch the demo city workspace"
      >
        {working ? "Loading…" : "Load Demo City"}
        <span style={{ marginLeft: 4, fontSize: 9, color: "var(--ink-3)" }}>▾</span>
      </Btn>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 30,
          width: 280,
          background: "var(--paper)",
          border: "1px solid var(--rule-strong)",
          boxShadow: "0 10px 24px rgba(15,23,42,0.10)",
        }}>
          <div style={{
            padding: "8px 14px 6px",
            borderBottom: "1px solid var(--rule)",
            background: "var(--paper-2)",
          }}>
            <div className="mono" style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em",
              color: "var(--ink-3)", textTransform: "uppercase",
            }}>Demo workspaces</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
              Each city loads its own seeded model.
            </div>
          </div>
          {JURISDICTIONS.map((j, i) => {
            const isActive = j.id === active.id;
            const live = j.dataAvailable;
            return (
              <button
                key={j.id}
                type="button"
                onClick={() => handleSelect(j)}
                disabled={!live}
                style={{
                  display: "flex", flexDirection: "column", gap: 2,
                  width: "100%", textAlign: "left",
                  padding: "10px 14px",
                  background: isActive ? "var(--paper-2)" : "transparent",
                  border: "none",
                  borderTop: i > 0 ? "1px solid var(--rule)" : "none",
                  cursor: live ? "pointer" : "default",
                  opacity: live ? 1 : 0.55,
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  if (live && !isActive) e.currentTarget.style.background = "var(--paper-2)";
                }}
                onMouseLeave={(e) => {
                  if (live && !isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{
                  display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
                }}>
                  <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
                    {j.name}
                  </span>
                  {isActive && live && (
                    <span className="mono" style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                      color: "var(--pos)", textTransform: "uppercase",
                    }}>Active</span>
                  )}
                  {!live && (
                    <span className="mono" style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                      color: "var(--ink-4)", textTransform: "uppercase",
                    }}>Coming soon</span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {j.defaultFiscalYear} · {j.departments.join(" · ")}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
