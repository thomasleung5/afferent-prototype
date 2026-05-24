// Annual Update — derived view of refresh activity + current model state.
//
// Numbers come from the live BuildState (seed + imports + edits). Each
// page in the /annual workflow renders a different slice of the same
// underlying data:
//   - Refresh:  per-domain import stats and a top-of-page summary band.
//   - Changes:  one row per recent import, with mapping counts and a
//               link back to the section that received the data.
//   - Packet:   a recovery / opportunity summary built from comparisons.

import type {
  CapPool, OperatingLine, Position, Service, WorkloadRow,
} from "../types";
import type { BuildImportLog, Domain } from "../store";
import { deriveBuildDerived, type BuildSnapshot, type StudyVersion } from "../store";
import type { FeeComparison, PolicyImpact } from "../calc";

type ConfLevel = "High" | "Medium-High" | "Medium" | "Low";

const DOMAIN_LABEL: Record<Domain, string> = {
  positions: "Direct Labor",
  operating: "Operating",
  services:  "Services",
  fees:      "Fee schedule",
  workload:  "Workload",
  cap:       "Overhead Cost Allocation",
};

const DOMAIN_HREF: Record<Domain, string> = {
  positions: "/build/direct-labor",
  operating: "/build/operating",
  services:  "/build/services",
  fees:      "/build/feestudy",
  workload:  "/build/workload",
  cap:       "/build/cap",
};

const DOMAIN_SECTION_CODE: Record<Domain, string> = {
  positions: "SAL", operating: "OPS", services: "SVC",
  fees: "FEE", workload: "WKL", cap: "CAP",
};

const ALL_DOMAINS: Domain[] = ["positions", "operating", "workload", "services", "fees", "cap"];

export interface AnnualChange {
  id: string;
  change: string;
  prior: string;
  current: string;
  impact: string;
  affected: string;
  confidence: ConfLevel;
  action: string;
  badge: string;
}

export interface RefreshSectionCard {
  domain: Domain;
  name: string;
  section: string;
  rows: number;
  mapped: number;
  review: number;
  conf: ConfLevel;
  importCount: number;
  lastImport: string | undefined;
  hasImports: boolean;
  seedCount: number;
  href: string;
}

interface RefreshSummary {
  totalRows: number;
  totalMapped: number;
  totalReview: number;
  autoPct: number;
  inputsRefreshed: number;
  totalInputs: number;
  confidence: ConfLevel;
  lastRefresh: string;
  hasImports: boolean;
}

interface RecoveryDelta {
  currentBlended: number;
  policyTarget: number;
  gapPts: number;
}

export interface FeeChangeExplanation {
  id: string;
  name: string;
  dept: string;
  priorRecommended: number;
  currentRecommended: number;
  unitDelta: number;
  annualDelta: number;
  hoursEffect: number;
  directRateEffect: number;
  operatingRateEffect: number;
  capRateEffect: number;
  policyEffect: number;
  adoptedGap: number;
  currentHours: number;
  priorHours: number;
  currentFbhr: number;
  priorFbhr: number;
  primaryDriver: string;
}

interface AnnualInput {
  imports: BuildImportLog[];
  positions: Position[];
  operating: OperatingLine[];
  workload: WorkloadRow[];
  services: Service[];
  capPools: CapPool[];
  comparisons: FeeComparison[];
  impact: PolicyImpact;
}

// ---------------------------------------------------------------------------
// Refresh page
// ---------------------------------------------------------------------------

export function deriveRefreshSections(input: AnnualInput): RefreshSectionCard[] {
  return ALL_DOMAINS.map((domain) => buildSectionCard(domain, input));
}

export function deriveRefreshSummary(input: AnnualInput): RefreshSummary {
  const cards = deriveRefreshSections(input);
  const importedCards = cards.filter((c) => c.hasImports);
  const totalRows   = importedCards.reduce((a, c) => a + c.rows, 0);
  const totalMapped = importedCards.reduce((a, c) => a + c.mapped, 0);
  const totalReview = importedCards.reduce((a, c) => a + c.review, 0);
  const autoPct = totalRows > 0 ? Math.round((totalMapped / totalRows) * 100) : 0;
  const lastRefresh = importedCards
    .map((c) => c.lastImport).filter(Boolean)
    .sort().reverse()[0];
  return {
    totalRows,
    totalMapped,
    totalReview,
    autoPct,
    inputsRefreshed: importedCards.length,
    totalInputs: ALL_DOMAINS.length,
    confidence: confidenceFor(totalMapped, totalRows),
    lastRefresh: lastRefresh ? formatStamp(lastRefresh) : "Seed data",
    hasImports: importedCards.length > 0,
  };
}

function buildSectionCard(domain: Domain, input: AnnualInput): RefreshSectionCard {
  const matching = input.imports.filter((e) => e.domain === domain);
  const rows = matching.reduce((a, e) => a + e.result.rows, 0);
  const mapped = matching.reduce((a, e) => a + e.result.mapped, 0);
  const review = matching.reduce((a, e) => a + e.result.lowConfidence, 0);
  const lastImport = matching.length > 0
    ? matching.reduce((a, b) => (b.id > a.id ? b : a)).at
    : undefined;
  return {
    domain,
    name: SECTION_NAMES[domain],
    section: DOMAIN_LABEL[domain],
    rows,
    mapped,
    review,
    conf: matching.length > 0 ? confidenceFor(mapped, rows) : "High",
    importCount: matching.length,
    lastImport,
    hasImports: matching.length > 0,
    seedCount: seedCountFor(domain, input),
    href: DOMAIN_HREF[domain],
  };
}

const SECTION_NAMES: Record<Domain, string> = {
  positions: "Staffing / Direct Labor",
  operating: "Operating Budget",
  workload:  "Workload Volumes",
  services:  "Services Catalog",
  fees:      "Fee Schedule",
  cap:       "CAP / Indirect Costs",
};

function seedCountFor(domain: Domain, input: AnnualInput): number {
  switch (domain) {
    case "positions": return input.positions.length;
    case "operating": return input.operating.length;
    case "workload":  return input.workload.length;
    case "services":  return input.services.length;
    case "fees":      return input.services.filter((s) => s.fee > 0).length;
    case "cap":       return input.capPools.length;
  }
}

// ---------------------------------------------------------------------------
// Changes page
// ---------------------------------------------------------------------------

export function deriveAnnualChanges(input: AnnualInput): AnnualChange[] {
  if (input.imports.length === 0) return [];
  // Newest first. Each import is one change record.
  const sorted = [...input.imports].sort((a, b) => b.id - a.id);
  return sorted.map((entry): AnnualChange => {
    const r = entry.result;
    const totalProcessed = r.mapped + r.lowConfidence + r.unmapped + r.duplicates;
    const reviewCount = r.lowConfidence + r.unmapped;
    return {
      id: `change-${entry.id}`,
      change: `${DOMAIN_LABEL[entry.domain]} refreshed from ${r.fileName}`,
      prior: r.duplicates > 0
        ? `${r.duplicates} existing row${r.duplicates === 1 ? "" : "s"}`
        : "Seed baseline",
      current: `${r.mapped} new · ${reviewCount} for review`,
      impact: importImpactLabel(r),
      affected: r.detected ?? DOMAIN_LABEL[entry.domain],
      confidence: confidenceFor(r.mapped, Math.max(1, totalProcessed)),
      action: `Open ${DOMAIN_LABEL[entry.domain]}`,
      badge: badgeFor(r),
    };
  });
}

export function deriveRecoveryDelta(input: AnnualInput): RecoveryDelta {
  const { impact } = input;
  const current = impact.totalCost > 0
    ? (impact.currentRevenue / impact.totalCost) * 100
    : 0;
  return {
    currentBlended: Math.round(current),
    policyTarget: Math.round(impact.overallPct),
    gapPts: Math.round(impact.overallPct - current),
  };
}

export function deriveNetImpact(input: AnnualInput): number {
  // Sum of net adoption uplift across every fee comparison — the same
  // number Fee Schedule's "Net adoption impact" shows.
  return input.comparisons.reduce((a, c) => a + c.annualUplift, 0);
}

export function deriveFeeChangeExplanations(
  current: BuildSnapshot,
  baseline: StudyVersion | null | undefined,
): FeeChangeExplanation[] {
  if (!baseline) return [];
  const priorDerived = deriveBuildDerived(baseline.snapshot);
  const currentDerived = deriveBuildDerived(current);
  const priorServices = new Map(baseline.snapshot.services.map((s) => [s.id, s]));
  const priorComparisons = new Map(priorDerived.comparisons.map((c) => [c.id, c]));

  return currentDerived.comparisons
    .map((cur): FeeChangeExplanation | null => {
      const curService = current.services.find((s) => s.id === cur.id);
      const priorService = priorServices.get(cur.id);
      const prior = priorComparisons.get(cur.id);
      if (!curService || !priorService || !prior) return null;

      const priorRate = priorDerived.fbhr[prior.dept];
      const currentRate = currentDerived.fbhr[cur.dept];
      if (!priorRate || !currentRate) return null;

      const priorTarget = prior.target / 100;
      const currentTarget = cur.target / 100;
      const priorFbhr = priorRate.fbhr;
      const currentFbhr = currentRate.fbhr;

      const priorRecommended = priorService.hours * priorFbhr * priorTarget;
      const afterHours = curService.hours * priorFbhr * priorTarget;
      const afterDirect = curService.hours
        * (currentRate.directRate + priorRate.operatingRate + priorRate.capRate)
        * priorTarget;
      const afterOperating = curService.hours
        * (currentRate.directRate + currentRate.operatingRate + priorRate.capRate)
        * priorTarget;
      const afterCap = curService.hours
        * (currentRate.directRate + currentRate.operatingRate + currentRate.capRate)
        * priorTarget;
      const currentRecommended = curService.hours * currentFbhr * currentTarget;

      const hoursEffect = afterHours - priorRecommended;
      const directRateEffect = afterDirect - afterHours;
      const operatingRateEffect = afterOperating - afterDirect;
      const capRateEffect = afterCap - afterOperating;
      const policyEffect = currentRecommended - afterCap;
      const unitDelta = currentRecommended - priorRecommended;
      const volume = cur.volume || prior.volume || 0;

      const components = [
        { label: "Service hours", value: hoursEffect },
        { label: "Direct labor rate", value: directRateEffect },
        { label: "Operating rate", value: operatingRateEffect },
        { label: "CAP overhead rate", value: capRateEffect },
        { label: "Policy target", value: policyEffect },
      ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

      return {
        id: cur.id,
        name: cur.name,
        dept: cur.dept,
        priorRecommended,
        currentRecommended,
        unitDelta,
        annualDelta: unitDelta * volume,
        hoursEffect,
        directRateEffect,
        operatingRateEffect,
        capRateEffect,
        policyEffect,
        adoptedGap: currentRecommended - cur.fee,
        currentHours: curService.hours,
        priorHours: priorService.hours,
        currentFbhr,
        priorFbhr,
        primaryDriver: Math.abs(components[0]?.value ?? 0) >= 0.5 ? components[0].label : "No material change",
      };
    })
    .filter((row): row is FeeChangeExplanation => !!row)
    .sort((a, b) => Math.abs(b.annualDelta) - Math.abs(a.annualDelta));
}

function importImpactLabel(r: BuildImportLog["result"]): string {
  if (r.mapped === 0 && r.lowConfidence === 0 && r.unmapped === 0) return "No mapping changes";
  if (r.unmapped > 0) return `+${r.mapped} mapped · ${r.unmapped} unmapped`;
  if (r.lowConfidence > 0) return `+${r.mapped} mapped · ${r.lowConfidence} low-confidence`;
  return `+${r.mapped} mapped`;
}

function badgeFor(r: BuildImportLog["result"]): string {
  if (r.unmapped > 0) return "Needs review";
  if (r.lowConfidence > 0) return "Low confidence";
  if (r.warnings.length > 0) return "Warnings";
  return "Confirm";
}

export function sectionCodeFor(domain: Domain | string): string {
  if (domain in DOMAIN_SECTION_CODE) {
    return DOMAIN_SECTION_CODE[domain as Domain];
  }
  return "OPS";
}

export function sectionLabelForDomain(domain: Domain): string {
  return DOMAIN_LABEL[domain];
}

export function sectionHrefForDomain(domain: Domain): string {
  return DOMAIN_HREF[domain];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceFor(mapped: number, total: number): ConfLevel {
  if (total <= 0) return "High";
  const pct = (mapped / total) * 100;
  if (pct >= 97) return "High";
  if (pct >= 90) return "Medium-High";
  if (pct >= 75) return "Medium";
  return "Low";
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
