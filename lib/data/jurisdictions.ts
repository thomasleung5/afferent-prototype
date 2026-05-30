/* Demo-jurisdiction registry.
 *
 * This is a *prototype* tenancy layer — there's no auth, RBAC, or
 * provisioning here. The registry just lets the UI know which
 * jurisdictions and fiscal years are selectable, and what
 * jurisdiction-specific metadata (name, peers, departments, etc.) to
 * render. Active selection lives in the build store
 * (state.activeJurisdictionId / state.activeFiscalYear).
 *
 * Adding a new demo jurisdiction:
 *   1. Append an entry to JURISDICTIONS.
 *   2. If the demo has data, point dataAvailable=true and seed the
 *      corresponding rows somewhere reachable.
 *   3. The TopBar selector will pick it up automatically when more
 *      than one jurisdiction has dataAvailable=true.
 */

export interface Jurisdiction {
  /** Stable kebab-case identifier. Used in active context, routes, and
   *  data keying. Never localize. */
  id: string;
  /** Display name (e.g. "Town of Los Altos Hills"). */
  name: string;
  /** Fiscal years selectable for this jurisdiction (e.g. "FY 2025-26"). */
  fiscalYears: string[];
  /** Fiscal year to land on when this jurisdiction is selected for the
   *  first time. Must be a member of fiscalYears. */
  defaultFiscalYear: string;
  /** Display-friendly department names. Used in the Jurisdiction config
   *  block (settings / about) but NOT for engine routing — engine uses
   *  DeptCode (PLAN/BLDG/ENG/…) defined in lib/types. */
  departments: string[];
  /** Peer cities used by the Fee Benchmarks module. */
  peers: string[];
  /** Attribution string shown on exported PDFs/Excel. */
  preparedBy: string;
  /** When false, this entry is a placeholder — selecting it should show
   *  an empty / coming-soon state rather than rendering live data. */
  dataAvailable: boolean;
  /** Path to a JSON file containing the jurisdiction's seed snapshot.
   *  Loaded by switchJurisdiction(id) on selection. Omit (or leave
   *  undefined) for the canonical default jurisdiction whose seed
   *  comes from initialState() in the store. */
  seedFile?: string;
}

export const JURISDICTIONS: Jurisdiction[] = [
  {
    id: "los-altos-hills",
    name: "Town of Los Altos Hills",
    fiscalYears: ["FY 2025-26"],
    defaultFiscalYear: "FY 2025-26",
    departments: ["Planning", "Building", "Engineering"],
    peers: ["Atherton", "Portola Valley", "Woodside", "Hillsborough", "Monte Sereno"],
    preparedBy: "Finance Department",
    dataAvailable: true,
  },
  {
    id: "city-of-maplewood",
    name: "City of Maplewood",
    fiscalYears: ["FY 2027-28"],
    defaultFiscalYear: "FY 2027-28",
    departments: [
      "Planning", "Building", "Engineering",
      "Parks & Recreation", "Police Services", "Fire Prevention",
    ],
    peers: ["Walnut Grove", "Cedar Springs", "Riverton", "Northfield", "Greenbrook"],
    preparedBy: "Finance Department",
    dataAvailable: true,
    // Seed snapshot lives in public/ so it's fetched at runtime — keeps
    // the bundle lean and makes it easy to swap in alternative demos.
    seedFile: "/test-seed.json",
  },
  // Coming-soon demos — show in the Demo City picker but render as
  // disabled until a seedFile lands and dataAvailable flips to true.
  {
    id: "city-of-cupertino",
    name: "City of Cupertino",
    fiscalYears: ["FY 2025-26"],
    defaultFiscalYear: "FY 2025-26",
    departments: ["Planning", "Building", "Public Works"],
    peers: [],
    preparedBy: "Finance Department",
    dataAvailable: false,
  },
  {
    id: "city-of-redwood-city",
    name: "City of Redwood City",
    fiscalYears: ["FY 2025-26"],
    defaultFiscalYear: "FY 2025-26",
    departments: ["Planning", "Building", "Engineering"],
    peers: [],
    preparedBy: "Finance Department",
    dataAvailable: false,
  },
  {
    id: "city-of-menlo-park",
    name: "City of Menlo Park",
    fiscalYears: ["FY 2025-26"],
    defaultFiscalYear: "FY 2025-26",
    departments: ["Planning", "Building", "Engineering"],
    peers: [],
    preparedBy: "Finance Department",
    dataAvailable: false,
  },
];

export const DEFAULT_JURISDICTION_ID = "los-altos-hills";

/** Lookup helper. Returns undefined for unknown ids. */
export function getJurisdiction(id: string): Jurisdiction | undefined {
  return JURISDICTIONS.find((j) => j.id === id);
}

/** Lookup with default fallback. Use when callers can't tolerate
 *  undefined — falls back to the canonical demo jurisdiction. */
export function getJurisdictionOrDefault(id: string | undefined): Jurisdiction {
  const found = id ? getJurisdiction(id) : undefined;
  return found ?? getJurisdiction(DEFAULT_JURISDICTION_ID)!;
}
