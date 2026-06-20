import { useEffect, useRef, useState } from "react";
import { switchJurisdiction, useActiveFiscalYear, useActiveJurisdiction } from "@/lib/active";
import { JURISDICTIONS, type Jurisdiction } from "@/lib/data/jurisdictions";
import { useBuildActions } from "@/lib/store";
import { clearActiveStudy, useActiveStudy } from "@/lib/studies/activeStudy";
import { withSuppressedAutosave } from "@/lib/studies/autosaveGuard";
import {
  clearConfirmCopy, resetConfirmCopy, switchConfirmCopy,
} from "@/lib/studies/destructiveCopy";
import { enableSandboxMode } from "@/lib/studies/sandboxMode";

/** TopBar settings popover anchored to the fiscal-year badge. Houses the
 *  three model-wide, infrequent, destructive actions that previously
 *  lived on the Build Model overview header:
 *
 *    - Load Demo (switch jurisdiction workspace)
 *    - Reset (re-seed the active jurisdiction)
 *    - Clear (wipe every input slice)
 *
 *  The FY badge stays visually static; clicking it toggles the popover.
 *  Closes on outside click + ESC. */
export function ModelSettingsMenu() {
  const fiscalYear = useActiveFiscalYear();
  const active = useActiveJurisdiction();
  const activeStudy = useActiveStudy();
  const { clearAll } = useBuildActions((s) => ({
    clearAll: s.clearAll,
  }));
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeStudyName = activeStudy?.name ? activeStudy.name : null;

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
    if (!j.dataAvailable) return;
    // Demo workspace switching is a SANDBOX action — it must not push
    // the swapped-in seed to the active server study. Confirm if a
    // study is currently active so the user knows the active id will
    // be detached.
    const decision = switchConfirmCopy({
      jurisdictionName: j.name,
      activeStudyName,
    });
    if (decision.needsConfirm && !window.confirm(decision.message)) return;
    setOpen(false);
    setWorking(true);
    try {
      // 1) Detach the active study FIRST so the autosave subscription
      //    (which reads getActiveStudyId() defensively) skips the
      //    upcoming store mutations.
      if (activeStudy) clearActiveStudy();
      // 2) Enter sandbox mode — the demo workspace is explicitly
      //    ephemeral exploration, so the StudySelectionGate at the
      //    route layer should NOT fire after the switch. The user
      //    leaves sandbox by picking a real study from the
      //    StudyMenu (which clears the flag).
      enableSandboxMode();
      // 3) Belt-and-braces: suppress autosave across the entire async
      //    switch (resetAll + seed fetch + setState).
      //    withSuppressedAutosave is async-aware — the suppression
      //    extends until switchJurisdiction's Promise settles.
      await withSuppressedAutosave(() => switchJurisdiction(j.id));
    } finally {
      setWorking(false);
    }
  }

  async function confirmReset() {
    setOpen(false);
    // Reset is intentionally NOT autosave-suppressed: when a server
    // study is active and the user confirms, that study's draft SHOULD
    // be updated to match the new local state. The copy makes the
    // side-effect explicit so the confirmation is informed.
    const ok = window.confirm(resetConfirmCopy({
      jurisdictionName: active.name,
      activeStudyName,
      blankWorkspace: active.blankWorkspace,
    }));
    if (!ok) return;
    setWorking(true);
    try {
      await switchJurisdiction(active.id);
    } finally {
      setWorking(false);
    }
  }

  function confirmClear() {
    setOpen(false);
    const ok = window.confirm(clearConfirmCopy({
      jurisdictionName: active.name,
      activeStudyName,
      blankWorkspace: active.blankWorkspace,
    }));
    if (ok) clearAll();
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ fontSize: "var(--t-l7)", fontWeight: 500 }}>{active.name}</div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={working}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Model settings"
        className="mono"
        style={{
          padding: "3px 7px",
          border: "1px solid var(--rule)",
          background: open ? "var(--paper)" : "var(--paper-2)",
          fontSize: "var(--t-l4)",
          color: "var(--ink-3)",
          cursor: "pointer",
        }}
      >
        {working ? "Loading…" : fiscalYear}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30,
            width: 280,
            background: "var(--paper)",
            border: "1px solid var(--rule-strong)",
            boxShadow: "0 10px 24px rgba(29,34,54,0.10)",
          }}
        >
          <SectionHeader label="Demo workspaces" hint="Each city loads its own seeded model." />
          {JURISDICTIONS.map((j, i) => (
            <JurisdictionRow
              key={j.id}
              j={j}
              activeId={active.id}
              isFirst={i === 0}
              onSelect={() => handleSelect(j)}
            />
          ))}

          <SectionHeader label="Model data" hint="Re-seed or wipe the active jurisdiction." />
          <MenuAction label="Reset to seed" sub={`Discard local edits in ${active.name}`} onClick={confirmReset}/>
          <MenuAction label="Clear all data" sub={`Wipe every input in ${active.name}`} danger onClick={confirmClear}/>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={{
      padding: "8px 14px 6px",
      borderBottom: "1px solid var(--rule)",
      background: "var(--paper-2)",
    }}>
      <div className="mono" style={{
        fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)", marginTop: 2 }}>{hint}</div>
    </div>
  );
}

function JurisdictionRow({
  j, activeId, isFirst, onSelect,
}: { j: Jurisdiction; activeId: string; isFirst: boolean; onSelect: () => void }) {
  const isActive = j.id === activeId;
  const live = j.dataAvailable;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!live}
      style={{
        display: "flex", flexDirection: "column", gap: 2,
        width: "100%", textAlign: "left",
        padding: "10px 14px",
        background: isActive ? "var(--paper-2)" : "transparent",
        border: "none",
        borderTop: isFirst ? "none" : "1px solid var(--rule)",
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
        <span style={{ fontSize: "var(--fs-ui)", color: "var(--ink)", fontWeight: 500 }}>{j.name}</span>
        {isActive && live && (
          <span className="mono" style={{
            fontSize: 9, fontWeight: 600, letterSpacing: "0.12em",
            color: "var(--pos)", textTransform: "uppercase",
          }}>Active</span>
        )}
        {!live && (
          <span className="mono" style={{
            fontSize: 9, fontWeight: 600, letterSpacing: "0.12em",
            color: "var(--ink-4)", textTransform: "uppercase",
          }}>Coming soon</span>
        )}
      </div>
      <span style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>
        {j.defaultFiscalYear} · {j.departments.join(" · ")}
      </span>
    </button>
  );
}

function MenuAction({
  label, sub, danger, onClick,
}: { label: string; sub: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 2,
        width: "100%", textAlign: "left",
        padding: "10px 14px",
        background: "transparent",
        border: "none",
        borderTop: "1px solid var(--rule)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{
        fontSize: "var(--fs-ui)",
        color: danger ? "var(--neg)" : "var(--ink)",
        fontWeight: 500,
      }}>{label}</span>
      <span style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>{sub}</span>
    </button>
  );
}
