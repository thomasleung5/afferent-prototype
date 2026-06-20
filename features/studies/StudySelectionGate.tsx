/* Route-level gate shown when the SPA is in production-shaped auth
 * (Supabase configured + session) but the user has not picked a
 * server-backed study. Editing the model in browser localStorage is
 * deliberately blocked at this layer: server-backed studies are the
 * required durable record for authenticated users. The user resolves
 * the gate by either picking an existing study, creating a new one,
 * or explicitly entering ephemeral "sandbox" exploration mode.
 *
 * UI rhythm matches the rest of the Build Model surfaces — same
 * `--paper` background, `--rule` borders, `mono` uppercase
 * eyebrow, dashed-border action buttons. No new visual primitives.
 *
 * The gate mounts the TopBar separately (in __root.tsx) so the
 * StudyMenu is always reachable from the chip in the top bar even
 * while the gate is showing. The "Continue without a study" link is
 * the escape hatch the demo-workspace flow also takes implicitly. */

import { useCallback, useEffect, useState } from "react";
import {
  createStudy, listOrganizations, listStudies,
  saveStudySnapshot,
  type Organization, type Study,
} from "@/lib/studies/studiesApi";
import { setActiveStudy } from "@/lib/studies/activeStudy";
import { enableSandboxMode } from "@/lib/studies/sandboxMode";
import { createBuildSnapshot, useBuildStore } from "@/lib/store";

type Phase = "loading" | "ok" | "not-configured" | "error";

export function StudySelectionGate() {
  const [studies, setStudies] = useState<Study[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [working, setWorking] = useState<"create" | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const activeJurisdictionId = useBuildStore((s) => s.activeJurisdictionId);
  const activeFiscalYear = useBuildStore((s) => s.activeFiscalYear);

  const load = useCallback(async () => {
    setPhase("loading");
    setErrorMsg("");
    const [studiesRes, orgsRes] = await Promise.all([
      listStudies({ jurisdictionId: activeJurisdictionId }),
      listOrganizations(),
    ]);
    if (!studiesRes.ok) {
      if (/not configured/i.test(studiesRes.message)) setPhase("not-configured");
      else { setPhase("error"); setErrorMsg(studiesRes.message); }
      return;
    }
    if (!orgsRes.ok) {
      if (/not configured/i.test(orgsRes.message)) setPhase("not-configured");
      else { setPhase("error"); setErrorMsg(orgsRes.message); }
      return;
    }
    setStudies(studiesRes.studies.filter(
      (s) => s.jurisdiction_id === activeJurisdictionId,
    ));
    setOrganizations(orgsRes.organizations);
    setPhase("ok");
  }, [activeJurisdictionId]);

  useEffect(() => { void load(); }, [load]);

  const creatableOrgs = (organizations ?? []).filter(
    (o) => o.role === "owner" || o.role === "admin" || o.role === "analyst",
  );
  // Mirror StudyMenu's single-org → auto-select behavior so the
  // selector is hidden in the common one-org case.
  const inferredOrgId = creatableOrgs.length === 1
    ? creatableOrgs[0].id
    : (selectedOrgId && creatableOrgs.some((o) => o.id === selectedOrgId))
      ? selectedOrgId
      : creatableOrgs[0]?.id ?? null;

  function pick(s: Study) {
    setActiveStudy({ id: s.id, name: s.name });
    // No need to disableSandboxMode here — the gate only renders
    // when sandbox is OFF in the first place.
  }

  async function handleCreate() {
    if (!inferredOrgId) return;
    const name = window.prompt("Study name:");
    if (!name || name.trim().length === 0) return;
    const fy = window.prompt("Fiscal year (optional, e.g. \"FY 2025-26\"):");
    setWorking("create");
    try {
      const res = await createStudy({
        organizationId: inferredOrgId,
        name: name.trim(),
        fiscalYear: fy?.trim() || activeFiscalYear,
        jurisdictionId: activeJurisdictionId,
      });
      if (!res.ok) {
        setPhase("error");
        setErrorMsg(res.message);
        return;
      }
      const snapshot = createBuildSnapshot(useBuildStore.getState());
      const saved = await saveStudySnapshot(res.study.id, snapshot);
      setActiveStudy({ id: res.study.id, name: res.study.name });
      if (!saved.ok) {
        window.alert(
          `Created "${res.study.name}", but the initial save failed (${saved.message}). `
          + "Open the Studies menu and click Save now to retry.",
        );
      }
    } finally {
      setWorking(null);
    }
  }

  function handleSandbox() {
    enableSandboxMode();
  }

  return (
    <div
      data-testid="study-selection-gate"
      style={{
        minHeight: "calc(100vh - 90px)", // TopBar reserves ~90px
        display: "flex", justifyContent: "center", alignItems: "flex-start",
        padding: "60px 24px",
        background: "var(--canvas)",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 540,
        background: "var(--paper)",
        border: "1px solid var(--rule-strong)",
        padding: "20px 22px",
      }}>
        <div className="mono" style={{
          fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.14em",
          color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 8,
        }}>Studies</div>
        <div className="display" style={{
          fontSize: 18, fontWeight: 600, color: "var(--ink)",
          letterSpacing: "-0.01em", marginBottom: 6,
        }}>Select a study to continue</div>
        <div style={{
          fontSize: "var(--t-l7)", color: "var(--ink-2)",
          lineHeight: 1.5, marginBottom: 16,
        }}>
          Server-backed studies are required for authenticated editing.
          Pick an existing study or create a new one. You can also
          continue in sandbox mode to explore the demo workspaces
          without saving.
        </div>

        {phase === "loading" && <Body>Loading studies…</Body>}

        {phase === "not-configured" && (
          <Body>
            Server study storage isn't configured on this deployment.
            You can continue in sandbox mode below; local edits stay
            in this browser only.
          </Body>
        )}

        {phase === "error" && (
          <Body tone="error">Couldn't load studies: {errorMsg || "unknown error"}.</Body>
        )}

        {phase === "ok" && studies && studies.length === 0 && (
          <Body>
            {inferredOrgId
              ? "No studies yet — create the first one below."
              : "No studies yet, and you don't have permission to create studies in any organization. Ask your admin."}
          </Body>
        )}

        {phase === "ok" && studies && studies.length > 0 && (
          <div
            data-testid="study-selection-gate-list"
            style={{
              border: "1px solid var(--rule)",
              maxHeight: 280, overflowY: "auto",
              marginBottom: 14,
            }}
          >
            {studies.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pick(s)}
                style={{
                  display: "flex", flexDirection: "column", gap: 2,
                  width: "100%", textAlign: "left",
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  borderTop: i === 0 ? "none" : "1px solid var(--rule)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  fontSize: "var(--fs-ui)", color: "var(--ink)", fontWeight: 500,
                }}>{s.name}</span>
                <span style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>
                  {s.fiscal_year ?? "—"} · updated {formatTimestamp(s.updated_at)}
                </span>
              </button>
            ))}
          </div>
        )}

        {phase === "ok" && creatableOrgs.length > 1 && (
          <div style={{
            padding: "10px 0", display: "flex", alignItems: "center", gap: 8,
          }}>
            <label
              htmlFor="study-gate-create-org"
              style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}
            >Create in</label>
            <select
              id="study-gate-create-org"
              data-testid="study-selection-gate-create-org"
              value={inferredOrgId ?? ""}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              style={{
                flex: 1, fontSize: "var(--t-l7)", fontFamily: "inherit",
                color: "var(--ink)", padding: "4px 6px",
                border: "1px solid var(--rule-strong)", background: "var(--paper)",
              }}
            >
              {creatableOrgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name} ({o.role})</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button
            type="button"
            data-testid="study-selection-gate-create"
            onClick={() => { void handleCreate(); }}
            disabled={!inferredOrgId || working === "create"}
            style={{
              fontSize: "var(--t-l7)", fontWeight: 500,
              color: "var(--accent)",
              padding: "6px 10px",
              border: "1px dashed var(--rule-strong)",
              background: "var(--paper)",
              cursor: !inferredOrgId || working === "create" ? "not-allowed" : "pointer",
              opacity: !inferredOrgId || working === "create" ? 0.55 : 1,
              fontFamily: "inherit",
            }}
          >+ New study…</button>
          <div style={{ flex: 1 }}/>
          <button
            type="button"
            data-testid="study-selection-gate-sandbox"
            onClick={handleSandbox}
            style={{
              fontSize: "var(--t-l7)", fontWeight: 500,
              color: "var(--ink-3)",
              padding: "6px 10px",
              border: "1px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ink-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ink-3)"; }}
          >Continue in sandbox →</button>
        </div>
      </div>
    </div>
  );
}

function Body({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div style={{
      padding: "10px 0",
      fontSize: "var(--t-l7)",
      lineHeight: 1.5,
      color: tone === "error" ? "var(--neg)" : "var(--ink-2)",
    }}>{children}</div>
  );
}

function formatTimestamp(ts: string): string {
  try { return new Date(ts).toLocaleString(); }
  catch { return ts; }
}
