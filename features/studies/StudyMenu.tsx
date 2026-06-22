/* Top-bar popover for the /api/studies persistence layer.
 *
 * Minimal Save/Load bridge on top of the existing Zustand store —
 * the localStorage editing model is unchanged; this menu lets an
 * authenticated user push the current snapshot to the server,
 * restore it later (recovery), create and load named immutable
 * snapshots, and pick which organization a new study lives in when
 * membership spans multiple orgs.
 *
 * Visibility:
 *   - Auth not configured (no VITE_SUPABASE_*)  → menu hidden.
 *   - Configured but not signed in              → menu hidden.
 *   - Signed in + DB unconfigured               → menu opens with a
 *     quiet "not configured" notice; local editing keeps working.
 *
 * Active-study id is persisted to localStorage via
 * lib/studies/activeStudy.ts (a tiny module + useSyncExternalStore
 * hook) so ModelSettingsMenu and the autosave subscription can
 * read/clear it without prop-drilling through TopBar. */

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  createBuildSnapshot, useBuildActions, useBuildStore,
} from "@/lib/store";
import {
  createStudy, createStudyVersion, getStudy, getStudyVersion,
  listOrganizations, listStudies, listStudyVersions, saveStudySnapshot,
  type Organization, type Study, type StudyVersionRow,
} from "@/lib/studies/studiesApi";
import { coerceServerSnapshot } from "@/lib/studies/snapshotCoercion";
import { withSuppressedAutosave } from "@/lib/studies/autosaveGuard";
import {
  clearActiveStudy, setActiveStudy, useActiveStudy,
} from "@/lib/studies/activeStudy";
import { disableSandboxMode, useSandboxMode } from "@/lib/studies/sandboxMode";
import { emitStaleStudyNotice } from "@/lib/studies/staleStudyNotice";
import {
  studySaveSummary, syncStatusCanSaveNow, syncStatusTone,
  type SyncStatus, type SyncTone,
} from "@/lib/studies/syncStatus";
import { useAutoSaveStudy } from "./useAutoSaveStudy";

type ServerState = "idle" | "loading" | "ok" | "not-configured" | "error";
type WorkingKind = "load" | "create" | "version" | "load-version" | null;
type Status = { kind: "ok" | "warn" | "error"; message: string } | null;
type PopoverView = "studies" | "versions";

const STALE_NOTICE_MESSAGE =
  "Active study is no longer accessible — reverted to local-only mode. "
  + "Your local edits are intact; pick another study to resume syncing.";

export function StudyMenu() {
  const { configured, session } = useAuth();
  if (!configured || !session) return null;
  return <StudyMenuMounted/>;
}

function StudyMenuMounted() {
  const { loadSnapshot } = useBuildActions((s) => ({ loadSnapshot: s.loadSnapshot }));
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PopoverView>("studies");
  const [studies, setStudies] = useState<Study[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [serverState, setServerState] = useState<ServerState>("idle");
  const [serverError, setServerError] = useState<string>("");
  const active = useActiveStudy();
  const activeId = active?.id ?? null;
  const activeJurisdictionId = useBuildStore((s) => s.activeJurisdictionId);
  const activeFiscalYear = useBuildStore((s) => s.activeFiscalYear);
  const [working, setWorking] = useState<WorkingKind>(null);
  const [status, setStatus] = useState<Status>(null);
  // Multi-org picker — user-chosen org id for the next "New study…".
  // Auto-selected when there's only one creatable org; otherwise the
  // user picks from a <select> rendered in the Actions section.
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  // Versions view state — fetched lazily when the user enters the
  // versions sub-view.
  const [versions, setVersions] = useState<StudyVersionRow[] | null>(null);
  const [versionsState, setVersionsState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [versionsError, setVersionsError] = useState<string>("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Outside-click + ESC close.
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

  const refresh = useCallback(async () => {
    setServerState("loading");
    setServerError("");
    const [studiesRes, orgsRes] = await Promise.all([
      listStudies({ jurisdictionId: activeJurisdictionId }),
      listOrganizations(),
    ]);
    if (!studiesRes.ok) {
      if (/not configured/i.test(studiesRes.message)) setServerState("not-configured");
      else { setServerState("error"); setServerError(studiesRes.message); }
      return;
    }
    if (!orgsRes.ok) {
      if (/not configured/i.test(orgsRes.message)) setServerState("not-configured");
      else { setServerState("error"); setServerError(orgsRes.message); }
      return;
    }
    const workspaceStudies = studiesRes.studies.filter(
      (s) => s.jurisdiction_id === activeJurisdictionId,
    );
    setStudies(workspaceStudies);
    setOrganizations(orgsRes.organizations);
    setServerState("ok");
    // Stale active id (not in the visible list) → clear + surface a
    // top-bar notice so the user notices without opening the menu.
    if (activeId && !workspaceStudies.some((s) => s.id === activeId)) {
      clearActiveStudy();
      emitStaleStudyNotice(STALE_NOTICE_MESSAGE);
      return;
    }
    // Backfill the stored name (legacy id-only entry, or server-side
    // rename).
    const match = activeId
      ? workspaceStudies.find((s) => s.id === activeId) ?? null
      : null;
    if (match && match.name !== active?.name) {
      setActiveStudy({ id: match.id, name: match.name });
    }
  }, [activeId, active, activeJurisdictionId]);

  // Lazy first load when the menu opens.
  useEffect(() => {
    if (!open) return;
    if (studies != null || serverState === "loading") return;
    void refresh();
  }, [open, studies, serverState, refresh]);

  // Eager mount-time refresh so the autosave subscription (enabled
  // requires `serverState === "ok"`) fires immediately for users who
  // picked a study via the StudySelectionGate without ever opening
  // this popover. Cheap: one list-studies call per session.
  useEffect(() => {
    if (studies != null || serverState !== "idle") return;
    void refresh();
    // Intentionally only on mount — refresh() is stable enough; this
    // useEffect should not re-run on dep changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Workspace changes invalidate the current study list. Refresh against
  // the new workspace and clear any remembered active study that does not
  // belong there.
  useEffect(() => {
    setStudies(null);
    setServerState("idle");
    void refresh();
    // Intentionally keyed only to the workspace id; refresh reads the
    // latest active-study ref from the render that scheduled this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJurisdictionId]);

  // Reset the versions sub-view whenever the active study changes
  // so we don't render a previous study's version list.
  useEffect(() => {
    setView("studies");
    setVersions(null);
    setVersionsState("idle");
    setVersionsError("");
  }, [activeId]);

  const activeStudy = useMemo(
    () => (activeId && studies ? studies.find((s) => s.id === activeId) ?? null : null),
    [activeId, studies],
  );

  const creatableOrgs = useMemo(() => {
    if (!organizations) return null;
    return organizations.filter((o) =>
      o.role === "owner" || o.role === "admin" || o.role === "analyst",
    );
  }, [organizations]);

  // Org id for the next "New study…":
  //   - exactly one creatable org → use it (single-org users see the
  //     same simple UX as before this pass);
  //   - active study is in a creatable org → default to that org;
  //   - multiple creatable orgs → user-picked via the <select> below.
  const inferredOrgId = useMemo(() => {
    if (!creatableOrgs || creatableOrgs.length === 0) return null;
    if (creatableOrgs.length === 1) return creatableOrgs[0].id;
    if (selectedOrgId && creatableOrgs.some((o) => o.id === selectedOrgId)) {
      return selectedOrgId;
    }
    if (activeStudy && creatableOrgs.some((o) => o.id === activeStudy.organization_id)) {
      return activeStudy.organization_id;
    }
    return creatableOrgs[0].id;
  }, [creatableOrgs, selectedOrgId, activeStudy]);

  const isSandbox = useSandboxMode();
  const autosave = useAutoSaveStudy({
    activeStudyId: activeId,
    enabled: serverState === "ok" && activeStudy != null,
    isNotConfigured: serverState === "not-configured",
    // StudyMenu only mounts when configured && session (see the top
    // of this file), so callers can treat this as a stable `true`.
    // Passed explicitly so the hook's contract is self-documenting.
    isAuthenticated: true,
    onStudyMissing: () => {
      clearActiveStudy();
      emitStaleStudyNotice(STALE_NOTICE_MESSAGE);
      setStatus({
        kind: "warn",
        message: "Active study is no longer accessible. Reverted to local-only.",
      });
      void refresh();
    },
  });

  async function handleSaveNow() {
    if (!activeId) return;
    setStatus(null);
    await autosave.saveNow();
  }

  async function handleLoad() {
    if (!activeId) return;
    const target = activeStudy?.name ?? "study";
    if (!window.confirm(
      `Restore the last saved draft from "${target}"?\n\n`
      + "Local edits in this browser will be replaced with the saved draft.",
    )) return;
    setWorking("load");
    setStatus(null);
    try {
      const res = await getStudy(activeId);
      if (!res.ok) { setStatus({ kind: "error", message: res.message }); return; }
      if (!res.draft) {
        setStatus({
          kind: "warn",
          message: "No saved draft exists for this study yet. Edit anything and it'll auto-save.",
        });
        return;
      }
      const coerced = coerceServerSnapshot(res.draft.snapshot);
      if (!coerced.ok) { setStatus({ kind: "error", message: coerced.message }); return; }
      withSuppressedAutosave(() => { loadSnapshot(coerced.snapshot); });
      // Seed the optimistic-lock token from the freshly-loaded draft so
      // the very next autosave can detect a parallel writer.
      autosave.markSynced(Date.now(), res.draft.revision_id);
      setStatus({ kind: "ok", message: `Restored ${target}'s saved draft.` });
    } finally {
      setWorking(null);
    }
  }

  async function handleCreate() {
    if (!inferredOrgId) {
      setStatus({
        kind: "warn",
        message: "Pick an organization to create a study in.",
      });
      return;
    }
    const name = window.prompt("Study name:");
    if (!name || name.trim().length === 0) return;
    const fyInput = window.prompt("Fiscal year (optional, e.g. \"FY 2025-26\"):");
    setWorking("create");
    setStatus(null);
    try {
      const res = await createStudy({
        organizationId: inferredOrgId,
        name: name.trim(),
        fiscalYear: fyInput?.trim() || activeFiscalYear,
        jurisdictionId: activeJurisdictionId,
      });
      if (!res.ok) { setStatus({ kind: "error", message: res.message }); return; }
      setActiveStudy({ id: res.study.id, name: res.study.name });
      // Picking a real study explicitly exits sandbox mode — the
      // user has moved out of the ephemeral exploration state.
      disableSandboxMode();
      // Initial baseline save — same as before.
      const snap = createBuildSnapshot(useBuildStore.getState());
      const seedRes = await saveStudySnapshot(res.study.id, snap);
      if (seedRes.ok) {
        // First-ever save just minted a revision_id — track it so the
        // next save can quote it as expected_revision_id.
        autosave.markSynced(Date.now(), seedRes.revision_id);
        setStatus({ kind: "ok", message: `Created "${res.study.name}" and saved initial draft.` });
      } else {
        setStatus({
          kind: "warn",
          message: `Created "${res.study.name}" but initial save failed (${seedRes.message}). Edit anything to retry.`,
        });
      }
      void refresh();
    } finally {
      setWorking(null);
    }
  }

  async function handleCutVersion() {
    if (!activeId) return;
    const label = window.prompt("Snapshot name (e.g. \"Mid-year cut\"):");
    if (!label || label.trim().length === 0) return;
    setWorking("version");
    setStatus(null);
    try {
      const snap = createBuildSnapshot(useBuildStore.getState());
      const res = await createStudyVersion(activeId, {
        label: label.trim(),
        snapshot: snap,
      });
      if (!res.ok) { setStatus({ kind: "error", message: res.message }); return; }
      setStatus({
        kind: "ok",
        message: `Created snapshot ${res.version.version_number}: ${res.version.label}.`,
      });
      // If we're sitting in the versions view, refresh the list so
      // the new snapshot appears without an extra round trip.
      if (view === "versions") void loadVersions();
    } finally {
      setWorking(null);
    }
  }

  const loadVersions = useCallback(async () => {
    if (!activeId) return;
    setVersionsState("loading");
    setVersionsError("");
    const res = await listStudyVersions(activeId);
    if (!res.ok) {
      setVersionsState("error");
      setVersionsError(res.message);
      return;
    }
    setVersions(res.versions);
    setVersionsState("ok");
  }, [activeId]);

  function handleEnterVersions() {
    setStatus(null);
    setView("versions");
    if (versionsState === "idle" || versionsState === "error") {
      void loadVersions();
    }
  }

  function handleExitVersions() {
    setView("studies");
  }

  async function handleLoadVersion(v: StudyVersionRow) {
    if (!activeId) return;
    const label = `v${v.version_number} (${v.label})`;
    if (!window.confirm(
      `Load ${label}?\n\n`
      + "Local edits will be replaced with this version's snapshot. "
      + "The study draft on the server is NOT modified by this action — "
      + "you'll see \"Edit or Save now to push it to the draft\" "
      + "afterwards.",
    )) return;
    setWorking("load-version");
    setStatus(null);
    try {
      const res = await getStudyVersion(activeId, v.id);
      if (!res.ok) { setStatus({ kind: "error", message: res.message }); return; }
      const coerced = coerceServerSnapshot(res.version.snapshot);
      if (!coerced.ok) { setStatus({ kind: "error", message: coerced.message }); return; }
      withSuppressedAutosave(() => { loadSnapshot(coerced.snapshot); });
      // Deliberately DO NOT call markSynced — the local state now
      // differs from the server draft. The autosave subscription is
      // suppressed during loadSnapshot, so no save fires here.
      // markDiverged surfaces "Save now" explicitly since no pending
      // edit exists to trigger autosave on its own.
      autosave.markDiverged();
      setStatus({
        kind: "ok",
        message: `Loaded ${label} locally. Edit or Save now to push it to the draft.`,
      });
      setView("studies");
    } finally {
      setWorking(null);
    }
  }

  // ── Rendering ────────────────────────────────────────────────────

  // The trigger is now a quiet save/status control: "Saved" / "Saving"
  // / "Save failed" / "Local" / "Select study" / "Sandbox". Active-
  // study context lives in the tooltip so the top bar doesn't
  // visually duplicate the jurisdiction + FY context selector to its
  // left. Sandbox mode overrides the autosave status because while
  // sandbox is on, the user has deliberately opted out of server
  // persistence and shouldn't see a "Select study" prompt in the chip.
  const triggerLabel = working
    ? `${labelForWorking(working)}…`
    : isSandbox && !activeStudy
      ? "Sandbox"
      : triggerSyncLabel(autosave.status);
  const triggerDisabled = working === "load" || working === "load-version";
  const syncTone = isSandbox && !activeStudy
    ? "warn"
    : syncStatusTone(autosave.status);
  const triggerTitle = activeStudy
    ? studySaveSummary(autosave.status, activeStudy.name)
    : isSandbox
      ? "Sandbox mode — current work is saved in this browser only. Select a study from this menu to save it to the server."
      : studySaveSummary(autosave.status, null);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {/* Visual rhythm intentionally mirrors the FY chip in
          ModelSettingsMenu (same `mono` class, padding, font-size,
          border, and ink-3 color). The colored sync dot is the only
          deliberate divergence — it carries the status signal that
          the FY chip doesn't need. */}
      <button
        type="button"
        data-testid="study-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        disabled={triggerDisabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Studies — ${triggerLabel}`}
        title={triggerTitle}
        className="mono"
        style={{
          padding: "3px 7px",
          border: "1px solid var(--rule)",
          background: open ? "var(--paper)" : "var(--paper-2)",
          fontSize: "var(--t-l4)",
          color: "var(--ink-3)",
          cursor: triggerDisabled ? "not-allowed" : "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
          maxWidth: 160,
          opacity: triggerDisabled ? 0.6 : 1,
        }}
      >
        <SyncDot tone={syncTone} pulse={autosave.status.kind === "saving"}/>
        <span style={{
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{triggerLabel}</span>
      </button>

      {open && view === "studies" && (
        <div role="menu" style={popoverStyle}>
          <SectionHeader
            label="Studies"
            hint="Server save/load. Local editing stays on this device."
          />

          {serverState === "loading" && <Body>Loading studies…</Body>}
          {serverState === "not-configured" && (
            <Body>
              Server study storage isn't configured on this deployment. Local
              editing continues to work — your changes are persisted to this
              browser's localStorage.
            </Body>
          )}
          {serverState === "error" && (
            <Body tone="error">Couldn't load studies: {serverError || "unknown error"}.</Body>
          )}

          {serverState === "ok" && studies && studies.length === 0 && (
            <Body>
              {inferredOrgId
                ? "No studies yet. Use “New study…” below to create the first one."
                : "No studies yet, and you don't have permission to create studies in any organization. Ask your admin."}
            </Body>
          )}
          {serverState === "ok" && studies && studies.length > 0 && (
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {studies.map((s, i) => (
                <StudyRow
                  key={s.id}
                  s={s}
                  isFirst={i === 0}
                  isActive={s.id === activeId}
                  onSelect={() => {
                    setActiveStudy({ id: s.id, name: s.name });
                    // Picking a real study exits sandbox mode.
                    disableSandboxMode();
                  }}
                />
              ))}
            </div>
          )}

          {serverState === "ok" && activeStudy && (
            <SyncStatusRow
              status={autosave.status}
              studyName={activeStudy.name}
              onSaveNow={() => { void handleSaveNow(); }}
            />
          )}
          {serverState === "ok" && !activeStudy && (
            <Body data-testid="study-menu-local-only-banner">
              {studySaveSummary(autosave.status, null)}
            </Body>
          )}

          {serverState === "ok" && (
            <>
              <SectionHeader
                label="Actions"
                hint={activeStudy
                  ? `Auto-save runs in the background, saving to "${activeStudy.name}". Other actions target this study.`
                  : "Select a study above, or create one below, first."}
              />
              <MenuAction
                label="Create named snapshot…"
                sub="Save the current state as a named, immutable snapshot you can return to later."
                disabled={!activeStudy || working === "version"}
                onClick={() => { void handleCutVersion(); }}
              />
              <MenuAction
                label="Versions…"
                sub="Browse + load named snapshots previously created for this study."
                disabled={!activeStudy}
                onClick={handleEnterVersions}
              />
              {creatableOrgs && creatableOrgs.length > 1 && (
                <CreateOrgPickerRow
                  orgs={creatableOrgs}
                  value={inferredOrgId}
                  onChange={setSelectedOrgId}
                />
              )}
              <MenuAction
                label="New study…"
                sub={inferredOrgId
                  ? `Create a study in ${nameOfOrg(organizations, inferredOrgId) ?? "the selected organization"}.`
                  : "You don't have permission to create studies in any organization."}
                disabled={!inferredOrgId || working === "create"}
                onClick={() => { void handleCreate(); }}
              />
              <MenuAction
                label="Restore saved draft…"
                sub="Recovery: discard local edits and restore this study's last saved draft from the server."
                disabled={!activeStudy || working === "load"}
                onClick={() => { void handleLoad(); }}
              />
            </>
          )}

          {status && <StatusFooter status={status}/>}
        </div>
      )}

      {open && view === "versions" && (
        <div role="menu" style={popoverStyle}>
          <SectionHeader
            label={`Versions of ${activeStudy?.name ?? "study"}`}
            hint="Named immutable snapshots. Loading one updates only local state."
            backButton={{ label: "← Studies", onClick: handleExitVersions }}
          />

          {versionsState === "loading" && <Body>Loading versions…</Body>}
          {versionsState === "error" && (
            <Body tone="error">Couldn't load versions: {versionsError || "unknown error"}.</Body>
          )}
          {versionsState === "ok" && versions && versions.length === 0 && (
            <Body>
              No snapshots yet. Use “Create named snapshot…” on the Studies
              view to create the first one.
            </Body>
          )}
          {versionsState === "ok" && versions && versions.length > 0 && (
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {versions.map((v, i) => (
                <VersionRow
                  key={v.id}
                  v={v}
                  isFirst={i === 0}
                  disabled={working === "load-version"}
                  onLoad={() => { void handleLoadVersion(v); }}
                />
              ))}
            </div>
          )}

          {status && <StatusFooter status={status}/>}
        </div>
      )}
    </div>
  );
}

// ── Trigger sync-status label ────────────────────────────────────────

/** Compact label shown in the top-bar trigger. The full verbose label
 *  (e.g. "Saved · 3m ago") stays in the tooltip + popover status row;
 *  the trigger sticks to one-word states so it reads as a quiet save
 *  indicator next to the jurisdiction + fiscal-year context selector. */
function triggerSyncLabel(s: SyncStatus): string {
  switch (s.kind) {
    case "saving":         return "Saving";
    case "error":          return "Save failed";
    case "saved":          return "Saved";
    case "idle":           return "Saved";
    case "diverged":       return "Unsaved";
    case "local-only":     return "Local";
    case "not-configured": return "Local";
    case "awaiting-study": return "Select study";
    case "conflict":       return "Conflict";
  }
}

// ── Small UI pieces ─────────────────────────────────────────────────

function labelForWorking(w: NonNullable<WorkingKind>): string {
  switch (w) {
    case "load":         return "Restoring";
    case "create":       return "Creating";
    case "version":      return "Creating snapshot";
    case "load-version": return "Loading version";
  }
}

function SyncDot({ tone, pulse }: { tone: SyncTone; pulse: boolean }) {
  const color = toneColor(tone);
  return (
    <span
      aria-hidden
      style={{
        width: 6, height: 6, borderRadius: "50%",
        background: color,
        flexShrink: 0,
        opacity: pulse ? 0.5 : 1,
        transition: "opacity 600ms ease",
      }}
    />
  );
}

function toneColor(tone: SyncTone): string {
  switch (tone) {
    case "pos":     return "var(--pos)";
    case "warn":    return "var(--warn)";
    case "neg":     return "var(--neg)";
    case "neutral": return "var(--ink-3)";
  }
}

function SyncStatusRow({
  status, studyName, onSaveNow,
}: { status: SyncStatus; studyName: string; onSaveNow: () => void }) {
  const tone = syncStatusTone(status);
  // Names the save destination explicitly ("current work saved to X")
  // rather than a bare status word — the primary concept the popover
  // should communicate is WHERE this is saved, not just whether.
  const label = studySaveSummary(status, studyName);
  // Broader than "is this a failure" — also covers idle/saved states
  // where local content may have diverged from the last save with no
  // pending edit to trigger autosave (e.g. just loaded a named version).
  const showSaveNow = syncStatusCanSaveNow(status);
  // Inline error / conflict messages instead of hiding them behind a
  // title attribute — analysts couldn't see why a save failed without
  // hovering, and the verbose status fits in the popover row.
  const detail = status.kind === "error"
    ? status.message
    : null;
  return (
    <div style={{
      padding: "8px 14px",
      borderBottom: "1px solid var(--rule)",
      background: "var(--paper-2)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <SyncDot tone={tone} pulse={status.kind === "saving"}/>
        <span style={{
          flex: 1,
          fontSize: "var(--t-l7)",
          color: tone === "neg" ? "var(--neg)" : "var(--ink-2)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {label}
        </span>
        {showSaveNow && (
          <button
            type="button"
            onClick={onSaveNow}
            style={{
              all: "unset",
              cursor: "pointer",
              fontSize: "var(--t-l8)",
              fontWeight: 500,
              color: "var(--ink)",
              padding: "2px 8px",
              border: "1px solid var(--rule-strong)",
              background: "var(--paper)",
            }}
          >
            Save now
          </button>
        )}
      </div>
      {detail && (
        <div
          data-testid="sync-status-detail"
          style={{
            marginTop: 4,
            fontSize: "var(--t-l8)",
            color: "var(--neg)",
            wordBreak: "break-word",
          }}
        >{detail}</div>
      )}
    </div>
  );
}

const popoverStyle: CSSProperties = {
  position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 30,
  width: 360,
  background: "var(--paper)",
  border: "1px solid var(--rule-strong)",
  boxShadow: "0 10px 24px rgba(29,34,54,0.10)",
};

function SectionHeader({
  label, hint, backButton,
}: {
  label: string;
  hint: string;
  backButton?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{
      padding: "8px 14px 6px",
      borderBottom: "1px solid var(--rule)",
      background: "var(--paper-2)",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div className="mono" style={{
          fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{label}</div>
        {backButton && (
          <button
            type="button"
            onClick={backButton.onClick}
            style={{
              all: "unset", cursor: "pointer",
              fontSize: "var(--t-l8)",
              color: "var(--ink-3)",
            }}
          >{backButton.label}</button>
        )}
      </div>
      <div style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)", marginTop: 2 }}>{hint}</div>
    </div>
  );
}

function Body({
  children, tone, "data-testid": testId,
}: { children: ReactNode; tone?: "error"; "data-testid"?: string }) {
  return (
    <div data-testid={testId} style={{
      padding: "10px 14px",
      fontSize: "var(--t-l7)",
      lineHeight: 1.5,
      color: tone === "error" ? "var(--neg)" : "var(--ink-2)",
    }}>{children}</div>
  );
}

function StudyRow({
  s, isFirst, isActive, onSelect,
}: { s: Study; isFirst: boolean; isActive: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "flex", flexDirection: "column", gap: 2,
        width: "100%", textAlign: "left",
        padding: "10px 14px",
        background: isActive ? "var(--paper-2)" : "transparent",
        border: "none",
        borderTop: isFirst ? "none" : "1px solid var(--rule)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "var(--paper-2)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
      }}>
        <span style={{
          fontSize: "var(--fs-ui)", color: "var(--ink)", fontWeight: 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{s.name}</span>
        {isActive && (
          <span className="mono" style={{
            fontSize: 9, fontWeight: 600, letterSpacing: "0.12em",
            color: "var(--pos)", textTransform: "uppercase",
          }}>Selected</span>
        )}
      </div>
      <span style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>
        {s.fiscal_year ?? "—"} · updated {formatTimestamp(s.updated_at)}
      </span>
    </button>
  );
}

function VersionRow({
  v, isFirst, disabled, onLoad,
}: {
  v: StudyVersionRow;
  isFirst: boolean;
  disabled: boolean;
  onLoad: () => void;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 8,
      padding: "10px 14px",
      borderTop: isFirst ? "none" : "1px solid var(--rule)",
      alignItems: "center",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "baseline", gap: 8,
        }}>
          <span className="mono" style={{
            fontSize: "var(--t-l8)", color: "var(--ink-3)",
          }}>v{v.version_number}</span>
          <span style={{
            fontSize: "var(--fs-ui)", color: "var(--ink)", fontWeight: 500,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={v.label}>{v.label}</span>
        </div>
        <div style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)", marginTop: 2 }}>
          {v.status} · {formatTimestamp(v.created_at)} · {v.created_by.slice(0, 8)}…
        </div>
      </div>
      <button
        type="button"
        onClick={onLoad}
        disabled={disabled}
        style={{
          all: "unset",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: "var(--t-l8)", fontWeight: 500,
          color: "var(--ink)",
          padding: "4px 10px",
          border: "1px solid var(--rule-strong)",
          background: "var(--paper)",
          opacity: disabled ? 0.5 : 1,
        }}
      >Load</button>
    </div>
  );
}

function MenuAction({
  label, sub, disabled, onClick,
}: { label: string; sub: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", flexDirection: "column", gap: 2,
        width: "100%", textAlign: "left",
        padding: "10px 14px",
        background: "transparent",
        border: "none",
        borderTop: "1px solid var(--rule)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "var(--paper-2)"; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: "var(--fs-ui)", color: "var(--ink)", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>{sub}</span>
    </button>
  );
}

function CreateOrgPickerRow({
  orgs, value, onChange,
}: {
  orgs: Organization[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{
      padding: "10px 14px",
      borderTop: "1px solid var(--rule)",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <label
        htmlFor="study-menu-create-org"
        style={{
          fontSize: "var(--t-l8)", color: "var(--ink-3)",
          whiteSpace: "nowrap",
        }}
      >Create in</label>
      <select
        id="study-menu-create-org"
        data-testid="study-menu-create-org"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          fontSize: "var(--t-l7)",
          fontFamily: "inherit",
          color: "var(--ink)",
          padding: "4px 6px",
          border: "1px solid var(--rule-strong)",
          background: "var(--paper)",
        }}
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>{o.name} ({o.role})</option>
        ))}
      </select>
    </div>
  );
}

function StatusFooter({ status }: { status: NonNullable<Status> }) {
  return (
    <div style={{
      padding: "8px 14px",
      borderTop: "1px solid var(--rule)",
      fontSize: "var(--t-l7)",
      lineHeight: 1.5,
      color: status.kind === "error" ? "var(--neg)"
        : status.kind === "warn" ? "var(--warn)"
        : "var(--pos)",
    }}>{status.message}</div>
  );
}

function formatTimestamp(ts: string): string {
  try { return new Date(ts).toLocaleString(); }
  catch { return ts; }
}

function nameOfOrg(orgs: Organization[] | null, id: string): string | null {
  if (!orgs) return null;
  return orgs.find((o) => o.id === id)?.name ?? null;
}
