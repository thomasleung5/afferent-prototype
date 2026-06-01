/* Top-bar popover for the /api/studies persistence layer.
 *
 * Minimal Save/Load bridge on top of the existing Zustand store —
 * the localStorage editing model is unchanged; this menu lets an
 * authenticated user push the current snapshot to the server and
 * pull it back later, and cut named immutable versions.
 *
 * Visibility:
 *   - Auth not configured (no VITE_SUPABASE_*)  → menu hidden.
 *   - Configured but not signed in              → menu hidden.
 *   - Signed in + DB unconfigured               → menu opens with a
 *     quiet "not configured" notice; local editing keeps working.
 *
 * State that survives reloads is the active study id, persisted to
 * localStorage under `afferent.activeStudyId` so the menu remembers
 * which study a user was working with across page refreshes. This
 * is purely a UX preference — clearing it is harmless.
 *
 * Modelled visually on components/layout/ModelSettingsMenu so the
 * two TopBar popovers share their layout / interaction patterns. */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { createBuildSnapshot, useBuildActions, useBuildStore } from "@/lib/store";
import {
  createStudy, createStudyVersion, getStudy, listOrganizations, listStudies,
  saveStudySnapshot,
  type Organization, type Study,
} from "@/lib/studies/studiesApi";
import { coerceServerSnapshot } from "@/lib/studies/snapshotCoercion";

const ACTIVE_STUDY_STORAGE_KEY = "afferent.activeStudyId";

type ServerState = "idle" | "loading" | "ok" | "not-configured" | "error";
type WorkingKind = "save" | "load" | "create" | "version" | null;
type Status = { kind: "ok" | "warn" | "error"; message: string } | null;

export function StudyMenu() {
  const { configured, session } = useAuth();
  // Hidden until the user is signed in to a configured Supabase project.
  // Local-only editing via the Zustand store / localStorage continues
  // to work without this UI; the menu is purely the bridge to the
  // server-side persistence layer.
  if (!configured || !session) return null;
  return <StudyMenuMounted/>;
}

function StudyMenuMounted() {
  const { loadSnapshot } = useBuildActions((s) => ({ loadSnapshot: s.loadSnapshot }));
  const [open, setOpen] = useState(false);
  const [studies, setStudies] = useState<Study[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [serverState, setServerState] = useState<ServerState>("idle");
  const [serverError, setServerError] = useState<string>("");
  const [activeId, setActiveIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_STUDY_STORAGE_KEY); } catch { return null; }
  });
  const [working, setWorking] = useState<WorkingKind>(null);
  const [status, setStatus] = useState<Status>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function setActiveId(id: string | null) {
    setActiveIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_STUDY_STORAGE_KEY, id);
      else localStorage.removeItem(ACTIVE_STUDY_STORAGE_KEY);
    } catch { /* ignore */ }
  }

  // Outside-click + ESC close — same pattern as ModelSettingsMenu.
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
    // Fetch in parallel — the menu needs both lists to render
    // correctly (studies for the picker, organizations for the
    // "New study…" target inference).
    const [studiesRes, orgsRes] = await Promise.all([
      listStudies(),
      listOrganizations(),
    ]);
    // 503 from either endpoint maps to the friendly "not configured"
    // branch (same env contract — both surfaces share the DB).
    if (!studiesRes.ok) {
      if (/not configured/i.test(studiesRes.message)) {
        setServerState("not-configured");
      } else {
        setServerState("error");
        setServerError(studiesRes.message);
      }
      return;
    }
    if (!orgsRes.ok) {
      if (/not configured/i.test(orgsRes.message)) {
        setServerState("not-configured");
      } else {
        setServerState("error");
        setServerError(orgsRes.message);
      }
      return;
    }
    setStudies(studiesRes.studies);
    setOrganizations(orgsRes.organizations);
    setServerState("ok");
    // If the stored active id no longer matches any visible study,
    // clear it so the trigger label doesn't show a stale name.
    if (activeId && !studiesRes.studies.some((s) => s.id === activeId)) {
      setActiveId(null);
    }
  }, [activeId]);

  // Lazy first load when the menu opens.
  useEffect(() => {
    if (!open) return;
    if (studies != null || serverState === "loading") return;
    void refresh();
  }, [open, studies, serverState, refresh]);

  const activeStudy = useMemo(
    () => (activeId && studies ? studies.find((s) => s.id === activeId) ?? null : null),
    [activeId, studies],
  );

  // Orgs the caller can create studies in (owner / admin / analyst —
  // matches server/studies/authorization.ts:canCreateStudy and the RLS
  // policy on `studies` INSERT). Viewers see organizations they belong
  // to in `organizations` but cannot create through this menu.
  const creatableOrgs = useMemo(() => {
    if (!organizations) return null;
    return organizations.filter((o) =>
      o.role === "owner" || o.role === "admin" || o.role === "analyst",
    );
  }, [organizations]);

  // Org id for the next "New study…" action. Prefers the active
  // study's org (so create-more lands in the same place); otherwise
  // the first creatable membership. Multi-org users see all options
  // in this same first slot today — a proper picker is future polish.
  const inferredOrgId = useMemo(() => {
    if (activeStudy && creatableOrgs?.some((o) => o.id === activeStudy.organization_id)) {
      return activeStudy.organization_id;
    }
    return creatableOrgs?.[0]?.id ?? null;
  }, [activeStudy, creatableOrgs]);

  async function handleSave() {
    if (!activeId) return;
    setWorking("save");
    setStatus(null);
    try {
      const snap = createBuildSnapshot(useBuildStore.getState());
      const res = await saveStudySnapshot(activeId, snap);
      if (!res.ok) {
        setStatus({ kind: "error", message: res.message });
        return;
      }
      setStatus({
        kind: "ok",
        message: `Saved to ${activeStudy?.name ?? "study"}.`,
      });
      void refresh();
    } finally {
      setWorking(null);
    }
  }

  async function handleLoad() {
    if (!activeId) return;
    const target = activeStudy?.name ?? "study";
    const proceed = window.confirm(
      `Load draft from "${target}"?\n\n`
      + "Local edits in this browser will be replaced with the saved draft.",
    );
    if (!proceed) return;
    setWorking("load");
    setStatus(null);
    try {
      const res = await getStudy(activeId);
      if (!res.ok) {
        setStatus({ kind: "error", message: res.message });
        return;
      }
      if (!res.draft) {
        setStatus({
          kind: "warn",
          message: "No saved draft exists for this study yet. Save the current state first.",
        });
        return;
      }
      const coerced = coerceServerSnapshot(res.draft.snapshot);
      if (!coerced.ok) {
        setStatus({ kind: "error", message: coerced.message });
        return;
      }
      loadSnapshot(coerced.snapshot);
      setStatus({ kind: "ok", message: `Loaded ${target}.` });
    } finally {
      setWorking(null);
    }
  }

  async function handleCreate() {
    if (!inferredOrgId) {
      setStatus({
        kind: "warn",
        message: "No organization to create a study in. Contact your admin to provision one.",
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
        fiscalYear: fyInput?.trim() || undefined,
      });
      if (!res.ok) {
        setStatus({ kind: "error", message: res.message });
        return;
      }
      setActiveId(res.study.id);
      setStatus({ kind: "ok", message: `Created "${res.study.name}".` });
      void refresh();
    } finally {
      setWorking(null);
    }
  }

  async function handleCutVersion() {
    if (!activeId) return;
    const label = window.prompt("Version label (e.g. \"Mid-year cut\"):");
    if (!label || label.trim().length === 0) return;
    setWorking("version");
    setStatus(null);
    try {
      const snap = createBuildSnapshot(useBuildStore.getState());
      const res = await createStudyVersion(activeId, {
        label: label.trim(),
        snapshot: snap,
      });
      if (!res.ok) {
        setStatus({ kind: "error", message: res.message });
        return;
      }
      setStatus({
        kind: "ok",
        message: `Cut version ${res.version.version_number}: ${res.version.label}.`,
      });
    } finally {
      setWorking(null);
    }
  }

  const triggerLabel = activeStudy?.name ?? "Studies";
  const triggerDisabled = working === "save" || working === "load";

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={triggerDisabled}
        aria-expanded={open}
        aria-haspopup="menu"
        title={activeStudy ? `Active study: ${activeStudy.name}` : "Studies"}
        style={{
          all: "unset",
          cursor: triggerDisabled ? "not-allowed" : "pointer",
          fontSize: "var(--t-l7)", fontWeight: 500,
          color: "var(--ink)",
          padding: "4px 8px",
          border: "1px solid var(--rule)",
          background: open ? "var(--paper)" : "var(--paper-2)",
          display: "inline-flex", alignItems: "center", gap: 6,
          maxWidth: 220,
          opacity: triggerDisabled ? 0.6 : 1,
        }}
      >
        <span style={{
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{working ? `${labelForWorking(working)}…` : triggerLabel}</span>
        <span className="mono" style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>
          ▾
        </span>
      </button>

      {open && (
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
                  onSelect={() => setActiveId(s.id)}
                />
              ))}
            </div>
          )}

          {serverState === "ok" && (
            <>
              <SectionHeader
                label="Actions"
                hint={activeId ? "Targets the selected study above." : "Select a study first."}
              />
              <MenuAction
                label="Save draft"
                sub="Push the current local snapshot to the selected study."
                disabled={!activeId || working === "save"}
                onClick={() => { void handleSave(); }}
              />
              <MenuAction
                label="Load draft"
                sub="Replace local edits with the selected study's saved draft."
                disabled={!activeId || working === "load"}
                onClick={() => { void handleLoad(); }}
              />
              <MenuAction
                label="Cut version…"
                sub="Snapshot the current state as a named, immutable version."
                disabled={!activeId || working === "version"}
                onClick={() => { void handleCutVersion(); }}
              />
              <MenuAction
                label="New study…"
                sub={inferredOrgId
                  ? `Create a study in ${nameOfOrg(organizations, inferredOrgId) ?? "your organization"}.`
                  : "You don't have permission to create studies in any organization."}
                disabled={!inferredOrgId || working === "create"}
                onClick={() => { void handleCreate(); }}
              />
            </>
          )}

          {status && (
            <div style={{
              padding: "8px 14px",
              borderTop: "1px solid var(--rule)",
              fontSize: "var(--t-l7)",
              lineHeight: 1.5,
              color: status.kind === "error" ? "var(--neg)"
                : status.kind === "warn" ? "var(--warn)"
                : "var(--pos)",
            }}>{status.message}</div>
          )}
        </div>
      )}
    </div>
  );
}

function labelForWorking(w: NonNullable<WorkingKind>): string {
  switch (w) {
    case "save":    return "Saving";
    case "load":    return "Loading";
    case "create":  return "Creating";
    case "version": return "Cutting version";
  }
}

const popoverStyle: CSSProperties = {
  position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 30,
  width: 320,
  background: "var(--paper)",
  border: "1px solid var(--rule-strong)",
  boxShadow: "0 10px 24px rgba(29,34,54,0.10)",
};

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

function Body({ children, tone }: { children: ReactNode; tone?: "error" }) {
  return (
    <div style={{
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

function formatTimestamp(ts: string): string {
  try { return new Date(ts).toLocaleString(); }
  catch { return ts; }
}

function nameOfOrg(orgs: Organization[] | null, id: string): string | null {
  if (!orgs) return null;
  return orgs.find((o) => o.id === id)?.name ?? null;
}
