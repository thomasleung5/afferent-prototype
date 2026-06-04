
import { useMemo } from "react";
import { DataTable, type Column } from "@/components/table";
import { CellInput, CellSelect, RemoveIconButton, SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { PolicyException, Service } from "@/lib/types";
import { useBuildState } from "@/lib/store";

/** Synthetic value used for the "(unlinked)" leading option on legacy
 *  rows so the underlying <select> has SOMETHING selected while still
 *  giving the user a clear visual cue that the exception isn't bound to
 *  an actual service row. */
const UNLINKED = "";

export function PolicyExceptions() {
  const {
    services, policyExceptions, updatePolicyException, addPolicyException,
    removePolicyException, derived,
  } = useBuildState();

  // Lookup table keyed by service id for cheap label + dept retrieval.
  const serviceById = useMemo(() => {
    const m = new Map<string, Service>();
    for (const s of services) m.set(s.id, s);
    return m;
  }, [services]);

  // The fee-column dropdown options. Order = display order on the
  // services table (assumed already by-dept-then-name in the seed /
  // imports). Each option shows the fee code when available so the
  // analyst can identify near-duplicate service names quickly.
  const baseOptions = useMemo(
    () => services.map((s) => ({
      value: s.id,
      label: s.feeNo ? `${s.feeNo} · ${s.name}` : s.name,
    })),
    [services],
  );

  // Match each exception to its underlying fee row(s) and sum annual
  // subsidy across the matches: annualCost × (1 − target/100).
  // Matching mirrors targetFor's rule — serviceId first, then a legacy
  // case-insensitive fee-name match (for exceptions saved before the
  // id field landed). Typical exceptions have one match; sum guards
  // against duplicate-named fees in the legacy fallback.
  const subsidyByExceptionId = useMemo(() => {
    const out: Record<string, number> = {};
    for (const exc of policyExceptions) {
      let sub = 0;
      if (exc.serviceId) {
        const match = derived.comparisons.find((c) => c.id === exc.serviceId);
        if (match?.recoverable) {
          sub = Math.max(0, match.annualCost * (1 - match.target / 100));
        }
      } else {
        const key = exc.fee.toLowerCase();
        for (const c of derived.comparisons) {
          if (!c.recoverable) continue;
          if (c.name.toLowerCase() !== key) continue;
          sub += Math.max(0, c.annualCost * (1 - c.target / 100));
        }
      }
      out[exc.id] = sub;
    }
    return out;
  }, [policyExceptions, derived.comparisons]);

  function handlePickService(exc: PolicyException, nextValue: string) {
    if (nextValue === UNLINKED) {
      // The placeholder row is read-only — clicking it shouldn't strip
      // a previously-bound serviceId.
      return;
    }
    const svc = serviceById.get(nextValue);
    if (!svc) return;
    updatePolicyException(exc.id, { serviceId: svc.id, fee: svc.name });
  }

  const cols: Column<PolicyException>[] = [
    {
      key: "fee",
      label: "Fee",
      width: "minmax(240px, 1.6fr)",
      sortable: true,
      sortKey: (r) => {
        // Sort by the resolved display name so id-backed and legacy
        // rows interleave alphabetically.
        const svc = r.serviceId ? serviceById.get(r.serviceId) : null;
        return (svc?.name ?? r.fee).toLowerCase();
      },
      render: (r) => {
        const svc = r.serviceId ? serviceById.get(r.serviceId) : null;
        // The options list is row-specific because legacy / orphaned
        // exceptions need a leading "(unlinked)" entry that won't
        // appear for fully-bound rows. Keeping the option list small
        // per row also keeps the <select> open snappy.
        const isLegacy = !r.serviceId;
        const isOrphan = r.serviceId != null && !svc;
        const placeholder = isLegacy
          ? { value: UNLINKED, label: r.fee ? `${r.fee} (unlinked)` : "Choose a fee…" }
          : isOrphan
            ? { value: r.serviceId!, label: `${r.fee || r.serviceId} (missing)` }
            : null;
        const options = placeholder ? [placeholder, ...baseOptions] : baseOptions;
        return (
          <CellSelect
            value={r.serviceId ?? UNLINKED}
            options={options}
            onChange={(v) => handlePickService(r, v)}
          />
        );
      },
    },
    {
      key: "target",
      label: "Target",
      width: "120px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.target,
      render: (r) => (
        <CellInput
          type="number"
          value={r.target}
          onChange={(v) => updatePolicyException(r.id, { target: Number(v) || 0 })}
          suffix="%"
          min={0}
          max={200}
          align="right"
        />
      ),
    },
    {
      key: "subsidy",
      label: "Annual Subsidy",
      width: "140px",
      align: "right",
      sortable: true,
      sortKey: (r) => subsidyByExceptionId[r.id] ?? 0,
      render: (r) => {
        const sub = subsidyByExceptionId[r.id] ?? 0;
        return (
          <span
            className="num"
            title="Annual cost intentionally funded by the General Fund under this exception."
            style={{ color: sub > 0 ? "var(--ink)" : "var(--ink-4)" }}
          >
            {sub > 0 ? `${fmt.dollarsK(sub)}/yr` : "—"}
          </span>
        );
      },
    },
    {
      key: "note",
      label: "Policy note",
      width: "minmax(220px, 2fr)",
      sortable: true,
      render: (r) => (
        <CellInput
          value={r.note}
          onChange={(v) => updatePolicyException(r.id, { note: String(v) })}
          placeholder="Optional policy note"
        />
      ),
    },
    {
      key: "remove",
      label: "",
      width: "44px",
      align: "center",
      render: (r) => (
        <RemoveIconButton
          title="Remove exception"
          aria-label="Remove exception"
          onClick={() => removePolicyException(r.id)}
        />
      ),
    },
  ];

  return (
    <div>
      <SectionLabel right={`${policyExceptions.length} exceptions`}>
        Fee exceptions
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={policyExceptions}
        onAdd={addPolicyException}
        addLabel="Add fee exception"
        emptyState="No exceptions yet. Department targets apply to every fee."
      />
    </div>
  );
}
