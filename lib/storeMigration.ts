import {
  CAP_BASIS_UNITS, CAP_DIRECT_ALLOCATIONS,
} from "@/lib/data/cap";
import { SEED_ALLOCATION_BASES } from "@/lib/data/allocationBasesCatalog";
import { IMPORTS } from "@/lib/data/imports";
import { FUNCTIONAL_ALLOCATION_SEED } from "@/lib/data/functionalAllocation";
import { DEFAULT_STUDY_CONTEXT } from "@/lib/data/studyContext";
import { DEFAULT_JURISDICTION_ID, getJurisdiction } from "@/lib/data/jurisdictions";
import type {
  CapPool, DeptCode, OperatingLine, Position, Service, SourceTag, VolumeRow,
} from "@/lib/types";
import {
  buildLaborLinesFromBuckets, buildLaborLinesFromPositions,
  buildProductiveHoursFromPositions, defaultCenterOrder, synthCenterKey,
  type LaborBucket,
} from "./store";
import { classifyLaborType } from "./ai/parseOperating";
import type { BuildSnapshot, BuildState, StudyVersion } from "./store";
import { makeStudyVersion } from "./storeSnapshot";

const VALID_SOURCES: SourceTag[] = ["seed", "imported", "manual"];

const coerceSource = (v: unknown): SourceTag =>
  typeof v === "string" && (VALID_SOURCES as string[]).includes(v) ? (v as SourceTag) : "seed";

/** True when a string already looks like a center identity key (a glCode
 *  or a `seed:center:*` synth) rather than a free-form display name.
 *  Used as the idempotency check before re-translating center maps. */
function isLikelyCenterKey(s: string): boolean {
  // Synth keys + the LAH 011-NNNN pattern + tightly-formatted alphanumeric
  // codes ("BLDG", "EQUIP"). Display names like "City Manager" or "Finance
  // & Administrative Services" don't match.
  return s.startsWith("seed:center:")
    || /^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(s)
    || /^[A-Z][A-Z0-9_]*$/.test(s);
}

/** Translate the four name-keyed center maps + pool centerGlCode fields
 *  on a snapshot-like target into the glCode-keyed shape PR-11 requires.
 *  Operates in-place. Idempotent — runs only when the target's centers
 *  still look name-keyed. Used for both the live BuildState and every
 *  persisted version snapshot. */
function translateCenterMaps(target: Partial<BuildSnapshot>): void {
  // capCenterGlCodes was a name → glCode lookup map on the persisted state
  // shape pre-PR-12. It's no longer on BuildSnapshot, but the field can
  // still appear in legacy persisted blobs — read it via an opaque cast,
  // and delete it post-translation so we don't keep the dead key around.
  const legacy = target as Partial<BuildSnapshot> & {
    capCenterGlCodes?: Record<string, string>;
  };
  const glByName = legacy.capCenterGlCodes ?? {};
  const keyForName = (name: string): string => glByName[name] ?? synthCenterKey(name);

  // Pool centerGlCode backfill ALWAYS runs (independent of map translation)
  // so pools persisted before PR-9 get their identity key stamped. Skips
  // pools that already have a value.
  if (Array.isArray(target.capPools)) {
    target.capPools = target.capPools.map((p) => {
      if (p.centerGlCode) return p;
      return { ...p, centerGlCode: keyForName(p.center) } satisfies CapPool;
    });
  }

  const totals = target.capCenterTotals;
  if (!totals || Object.keys(totals).length === 0) return;
  const keys = Object.keys(totals);
  if (keys.every(isLikelyCenterKey)) return;

  // Collect every center name present anywhere on the target so no map
  // entry is silently dropped during translation.
  const names = new Set<string>([
    ...Object.keys(totals),
    ...Object.keys(target.capCenterDisallowed ?? {}),
    ...Object.keys(target.capCenterSources ?? {}),
    ...(Array.isArray(target.capCenterOrder) ? target.capCenterOrder : []),
  ]);

  const newTotals: Record<string, number> = {};
  const newDisallowed: Record<string, number> = {};
  type SourceMeta = { name: string; source: SourceTag; sourceFile?: string };
  const newSources: Record<string, SourceMeta> = {};
  const oldDisallowed = target.capCenterDisallowed ?? {};
  const oldSources = (target.capCenterSources ?? {}) as Record<string, Partial<SourceMeta>>;

  for (const name of names) {
    const key = keyForName(name);
    if (name in totals) newTotals[key] = totals[name];
    if (name in oldDisallowed) newDisallowed[key] = oldDisallowed[name];
    const meta = oldSources[name];
    newSources[key] = {
      name,
      source: coerceSource(meta?.source),
      ...(meta?.sourceFile ? { sourceFile: meta.sourceFile } : {}),
    };
  }
  target.capCenterTotals = newTotals;
  target.capCenterDisallowed = newDisallowed;
  target.capCenterSources = newSources;

  if (Array.isArray(target.capCenterOrder)) {
    target.capCenterOrder = target.capCenterOrder.map(keyForName);
  }

  // Drop the legacy field once we've consumed it — the BuildSnapshot
  // shape no longer carries it, so leaving it around would pollute every
  // future snapshot the user takes.
  delete (legacy as { capCenterGlCodes?: unknown }).capCenterGlCodes;
}

/** Apply every backfill the Zustand persist layer needs to bring an old
 *  persisted snapshot up to the current `BuildState` shape. Mutates
 *  `state` in place so it can be dropped straight into Zustand's
 *  `onRehydrateStorage` callback.
 *
 *  Each block is a one-way migration: only fields that are genuinely
 *  missing get re-seeded. Empty arrays / objects are treated as a user
 *  deliberately clearing seed data and left alone. Adding a new
 *  migration step? Append below — order matters when later steps read
 *  fields earlier steps may have just backfilled (e.g. allocationPercent
 *  reads capCenterTotals). */
export function migratePersistedState(state: Partial<BuildState>): void {
  // Rename "workload" → "volume" for state persisted before the Volume of
  // Activity tab was introduced. Covers the array field, the pendingReview
  // domain key, and the import-log domain discriminator (on both the entry
  // and its inner result). One-way: legacy fields are deleted after copy
  // so subsequent passes (and the SourceTag coercion below) see the new
  // shape.
  const legacy = state as unknown as Record<string, unknown>;
  if ("workload" in legacy && !("volume" in legacy)) {
    legacy.volume = legacy.workload;
    delete legacy.workload;
  }
  if (state.pendingReview && "workload" in state.pendingReview) {
    const pr = state.pendingReview as unknown as Record<string, unknown[]>;
    if (!("volume" in pr)) pr.volume = pr.workload;
    delete pr.workload;
  }
  if (Array.isArray(state.imports)) {
    for (const entry of state.imports) {
      if ((entry as { domain: string }).domain === "workload") {
        (entry as { domain: string }).domain = "volume";
      }
      const result = (entry as { result?: { domain?: string } }).result;
      if (result && result.domain === "workload") result.domain = "volume";
    }
  }

  // PR-11: flip center maps from name-keyed to glCode-keyed. Runs BEFORE
  // every backfill that reads/writes those maps; the helper detects
  // already-translated state and no-ops on it. The legacy
  // capCenterGlCodes field on persisted state (pre-PR-12) is consumed by
  // translateCenterMaps as a name → glCode lookup and then deleted.
  translateCenterMaps(state);

  if (!state.capCenterOrder || state.capCenterOrder.length === 0) {
    state.capCenterOrder = defaultCenterOrder(state.capPools ?? []);
  }
  if (!state.studyContext) state.studyContext = { ...DEFAULT_STUDY_CONTEXT };
  if (!state.activeJurisdictionId) {
    state.activeJurisdictionId = DEFAULT_JURISDICTION_ID;
  }
  if (!state.activeFiscalYear) {
    state.activeFiscalYear =
      getJurisdiction(state.activeJurisdictionId)?.defaultFiscalYear ?? "FY 2025-26";
  }
  if (!state.capCenterDisallowed) state.capCenterDisallowed = {};
  if (state.capBasisUnits == null) {
    state.capBasisUnits = CAP_BASIS_UNITS.map((bu) => ({
      ...bu, receivers: bu.receivers.map((r) => ({ ...r })),
    }));
  }
  if (state.capDirectAllocations == null) {
    state.capDirectAllocations = CAP_DIRECT_ALLOCATIONS.map((da) => ({
      ...da, receivers: da.receivers.map((r) => ({ ...r })),
    }));
  }
  if (state.directBills == null) {
    state.directBills = {};
  }
  // PR-K1: serviceRoleAllocations is a sparse override map — missing
  // means "use the FTE-weighted default at read time". Pre-K1 persisted
  // state has no slice at all, so backfill {} so reducers can do safe
  // spreads without optional-chaining.
  if (state.serviceRoleAllocations == null) {
    state.serviceRoleAllocations = {};
  }

  // Backfill seed imports if the persisted store has an empty log. The
  // Annual Update tab needs at least one import to render the Refresh
  // cards / Change queue / Packet narrative; new users get these from
  // initialState(), but earlier sessions stored [].
  if (!state.imports || state.imports.length === 0) {
    state.imports = IMPORTS.map((e) => ({
      ...e, result: { ...e.result, warnings: [...e.result.warnings] },
    }));
  }

  // PR-FA2: seed functional-allocation buckets on stores that pre-date
  // the slice. Empty array is treated as a deliberate clear (consistent
  // with the imports + allocationBases backfill pattern above) — only
  // null / undefined triggers re-seeding.
  if (state.functionalAllocation == null) {
    state.functionalAllocation = FUNCTIONAL_ALLOCATION_SEED.map((b) => ({ ...b }));
  }

  // capCenterSources default — keyed by center identity (glCode or synth),
  // value carries the display name lifted from capCenterTotals' keys (now
  // identity keys after translateCenterMaps). New seed sessions fall
  // through this path with `state.capCenterSources` already populated by
  // initialState; this branch only fires when a persisted state arrives
  // with no sources at all.
  if (!state.capCenterSources) {
    state.capCenterSources = Object.fromEntries(
      Object.keys(state.capCenterTotals ?? {}).map((key) => [
        key, { name: key, source: "seed" as SourceTag },
      ]),
    );
  }
  if (Array.isArray(state.services)) {
    state.services = state.services.map((s: Service) => ({ ...s, source: coerceSource(s.source) }));
  }
  // PR-F: state.positions is no longer part of BuildState. Persisted
  // blobs from earlier sessions still carry the slice — consume it
  // here (derive productiveHours + labor operating rows when those
  // haven't already been populated), then delete the legacy field so
  // it doesn't pollute future snapshots. Idempotent: re-running on
  // already-migrated state is a no-op.
  const legacyPos = state as Partial<BuildState> & { positions?: Position[] };
  if (Array.isArray(legacyPos.positions)) {
    const coercedPositions: Position[] = legacyPos.positions.map((p: Position) => ({
      ...p, source: coerceSource(p.source),
    }));
    if (!state.productiveHours) {
      state.productiveHours = buildProductiveHoursFromPositions(coercedPositions);
    }
    const existingOperating = Array.isArray(state.operating) ? state.operating : [];
    const hasLaborRows = existingOperating.some(
      (o) => (o as OperatingLine).costType === "Labor",
    );
    if (!hasLaborRows) {
      state.operating = [
        ...existingOperating,
        ...buildLaborLinesFromPositions(coercedPositions),
      ];
    }
    delete legacyPos.positions;
  }
  if (state.productiveHours == null) {
    state.productiveHours = [];
  }
  if (Array.isArray(state.operating)) {
    // PR-A: backfill costType on legacy rows. Existing persisted
    // operating data is non-labor (positions held labor cost before
    // this PR); stamping "Operating" lets the Direct Labor / Operating
    // filtered views work without a redundant null-check at every
    // read. Imports that pre-date the field get the same default.
    // The labor-row derivation now lives in the PR-F block above
    // because state.positions is consumed (and deleted) there.
    state.operating = state.operating.map((o: OperatingLine) => {
      const next: OperatingLine = {
        ...o,
        source: coerceSource(o.source),
        costType: o.costType ?? "Operating",
      };
      // PR-G: backfill laborType on labor-classified rows that pre-date
      // the field. Uses the parser's classifyLaborType so legacy rows
      // get the same Salary/Benefits split a fresh import would.
      // Existing values pass through untouched.
      if (next.costType === "Labor" && !next.laborType) {
        next.laborType = classifyLaborType({
          line: next.line, category: next.category,
        });
      }
      return next;
    });
    // PR-I: coalesce both flavors of legacy labor row ids into per-dept
    // GL-account-level aggregates (`op-labor-<dept>-<glCode>`).
    //   - PR-D ids: `op-labor-<positionId>-{salary|benefits}` (per role)
    //   - PR-H ids: `op-labor-<DEPT>-{salary|benefits}` (per dept × laborType)
    // Both end in `-salary` / `-benefits`; the new PR-I ids end in a
    // numeric GL object code (`51110`, `51220`, …), so the pattern is
    // conservatively "labor row whose id ends in -salary or -benefits".
    // Idempotent — once the rows are on the new id pattern, this block
    // is a no-op.
    const legacyLaborIdPattern = /-(salary|benefits)$/i;
    const legacyLaborRows = state.operating.filter(
      (o) => o.costType === "Labor" && legacyLaborIdPattern.test(o.id),
    );
    if (legacyLaborRows.length > 0) {
      const byDept = new Map<DeptCode, LaborBucket>();
      for (const row of legacyLaborRows) {
        // SHARED:CDS isn't a fee dept so it can't bucket-feed the GL
        // expansion; skip defensively (no seeded labor row ever carries
        // SHARED:CDS, but a hand-edited persisted state could).
        if (row.dept === "SHARED:CDS") continue;
        const dept = row.dept as DeptCode;
        const cur = byDept.get(dept) ?? { salary: 0, benefits: 0, source: row.source };
        if ((row.laborType ?? "Benefits") === "Salary") cur.salary   += row.amount;
        else                                            cur.benefits += row.amount;
        if (row.sourceFile && !cur.sourceFile) cur.sourceFile = row.sourceFile;
        byDept.set(dept, cur);
      }
      const survivors = state.operating.filter(
        (o) => !(o.costType === "Labor" && legacyLaborIdPattern.test(o.id)),
      );
      state.operating = [...survivors, ...buildLaborLinesFromBuckets(byDept)];
    }
  }
  if (Array.isArray(state.volume)) {
    state.volume = state.volume.map((w: VolumeRow) => ({ ...w, source: coerceSource(w.source) }));
  }
  // Backfill for state persisted before allocationBases existed. Without
  // this, basisForPool(pool, undefined) crashes the matrix.
  if (!state.allocationBases || state.allocationBases.length === 0) {
    state.allocationBases = SEED_ALLOCATION_BASES.map((b) => ({ ...b }));
  }
  // Backfill capCenterTotals + allocationPercent for state persisted
  // before the % column became editable. Derive totals from Σ amount per
  // center; derive each pool's % from amount/centerTotal. Keys are
  // pool.centerGlCode (guaranteed populated by translateCenterMaps above).
  if (state.capPools) {
    if (!state.capCenterTotals || Object.keys(state.capCenterTotals).length === 0) {
      const totals: Record<string, number> = {};
      for (const p of state.capPools) {
        const key = p.centerGlCode;
        if (!key) continue;
        totals[key] = (totals[key] ?? 0) + (p.amount ?? 0);
      }
      state.capCenterTotals = totals;
    }
    const totals = state.capCenterTotals;
    state.capPools = state.capPools.map((p): BuildState["capPools"][number] => {
      if (typeof p.allocationPercent === "number") return p;
      const total = totals[p.centerGlCode] ?? 0;
      const pct = total > 0 ? (p.amount / total) * 100 : 0;
      return { ...p, allocationPercent: pct };
    });
  }
  // Translate every persisted version snapshot so the version-comparison
  // dropdown keeps working across the PR-11 schema flip.
  if (Array.isArray(state.versions)) {
    for (const v of state.versions) {
      if (v.snapshot) translateCenterMaps(v.snapshot as Partial<BuildSnapshot>);
    }
  } else {
    // makeStudyVersion expects a `BuildSnapshot` shape; by this point in
    // the rehydrate we've backfilled every snapshot field, so the cast
    // is safe.
    const baseline = makeStudyVersion(state as BuildState, {
      label: "Recovered baseline",
      status: "adopted",
      notes: "Created from the first locally persisted model after versioning was enabled.",
    });
    state.versions = [baseline];
    state.comparisonVersionId = baseline.id;
  }
  if (state.comparisonVersionId && !state.versions.some((v: StudyVersion) => v.id === state.comparisonVersionId)) {
    state.comparisonVersionId = state.versions[0]?.id ?? null;
  }
}
