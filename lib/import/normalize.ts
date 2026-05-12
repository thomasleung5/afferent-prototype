/* Centralized alias / normalization layer. Every extractor and the mapping
 * engine consult this module instead of rolling their own normalizers.
 *
 * Each lookup returns {value, source, confidence} so callers can decide
 * whether to auto-accept or queue for review. */

import { SERVICES } from "@/lib/data/services";
import type { OpCategory } from "@/lib/types";

export type NormalizedDept = "PLAN" | "BLDG" | "ENG" | "SHARED" | "OTHER";

export interface Normalized<T> {
  value: T;
  /** Alias that matched, for the mapping reason. */
  source: string;
  /** 0..1. 1.0 = exact match against canonical, .65–.99 = alias, < .65 = guess. */
  confidence: number;
}

/* ── Departments ────────────────────────────────────────────────────────── */

const DEPT_ALIASES: Array<[NormalizedDept, RegExp[]]> = [
  ["PLAN", [
    /\bplanning\b/i, /\bplan\b/i,
    /\bcommunity development\b/i, /\bplanning division\b/i,
    /\bcurrent planning\b/i, /\badvance planning\b/i,
  ]],
  ["BLDG", [
    /\bbuilding\b/i, /\bbldg\b/i,
    /\bbuilding safety\b/i, /\bbuilding division\b/i,
    /\bplan check\b/i, /\binspections?\b/i,
  ]],
  ["ENG", [
    /\bengineering\b/i, /\beng\b/i,
    /\bpublic works engineering\b/i, /\bpw\b/i,
    /\bencroachment\b/i, /\bgrading\b/i,
  ]],
  ["SHARED", [
    /\bgeneral government\b/i, /\bshared\b/i, /\bcds\b/i,
    /\bcommunity development services\b/i, /\bindirect\b/i,
  ]],
];

export function normalizeDept(input: string | null | undefined): Normalized<NormalizedDept> | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  if (/^plan$/i.test(s)) return { value: "PLAN", source: s, confidence: 1 };
  if (/^bldg$/i.test(s)) return { value: "BLDG", source: s, confidence: 1 };
  if (/^eng$/i.test(s))  return { value: "ENG",  source: s, confidence: 1 };
  for (const [code, patterns] of DEPT_ALIASES) {
    for (const p of patterns) {
      if (p.test(s)) return { value: code, source: s, confidence: 0.85 };
    }
  }
  return null;
}

/* ── Operating account categories ───────────────────────────────────────── */

const CATEGORY_ALIASES: Array<[OpCategory, RegExp[]]> = [
  ["Software & subscriptions",  [/\bsoftware\b/i, /\bsubscription/i, /\bsaas\b/i, /\blicens(es|ing)\b/i]],
  ["Professional services",     [/\bprofessional services?\b/i, /\bconsult(ant|ing)/i, /\bcontract services?\b/i]],
  ["Training & travel",         [/\btraining\b/i, /\btravel\b/i, /\bconference\b/i, /\beducation\b/i]],
  ["Office & supplies",         [/\bsupplies\b/i, /\boffice\b/i, /\bpostage\b/i, /\bprint(ing)?\b/i]],
  ["Memberships & dues",        [/\bmembership/i, /\bdues\b/i, /\bsubscription dues/i]],
  ["Vehicles & equipment",      [/\bvehicle/i, /\bfleet\b/i, /\bequipment\b/i, /\bfuel\b/i]],
  ["Legal noticing",            [/\blegal notic(e|ing)\b/i, /\bpublication\b/i, /\bnoticing\b/i]],
  ["Capital outlay",            [/\bcapital outlay\b/i, /\bcapital\b/i, /\bcip\b/i]],
];

export function normalizeOpCategory(input: string | null | undefined): Normalized<OpCategory> | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  for (const [cat, patterns] of CATEGORY_ALIASES) {
    if (cat.toLowerCase() === s.toLowerCase()) {
      return { value: cat, source: s, confidence: 1 };
    }
    for (const p of patterns) {
      if (p.test(s)) return { value: cat, source: s, confidence: 0.8 };
    }
  }
  return { value: "Other", source: s, confidence: 0.3 };
}

/* ── Fiscal year ────────────────────────────────────────────────────────── */

const FY_RE = /\bFY[\s-]?(20)?(\d{2})[\s/-]?(20)?(\d{2})?\b/i;

export function normalizeFiscalYear(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = String(input).match(FY_RE);
  if (!m) return null;
  const a = `20${m[2]}`;
  const b = m[4] ? `20${m[4]}` : `${parseInt(a) + 1}`;
  return `FY ${a}-${b.slice(2)}`;
}

/* ── Service name fuzzy match against the catalog ───────────────────────── */

/** Simple alias overrides for known-trouble names that pure fuzzy matching misses. */
const SERVICE_ALIASES: Array<[string, string]> = [
  // [alias, canonical service name]
  ["pre-app meeting",          "Pre-Application Meeting"],
  ["preapplication meeting",   "Pre-Application Meeting"],
  ["adu permit",               "ADU permit"],
  ["accessory dwelling unit",  "ADU permit"],
];

function strip(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Jaccard over word sets — small + good enough for fee-name matching. */
function tokenJaccard(a: string, b: string): number {
  const A = new Set(strip(a).split(" ").filter((t) => t.length > 1));
  const B = new Set(strip(b).split(" ").filter((t) => t.length > 1));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return inter / union;
}

export interface ServiceMatch {
  serviceId: string;
  serviceName: string;
  confidence: number;
  source: string;
}

/** Best-effort match against the canonical service catalog. Returns the top
 *  candidate plus the second-best for ambiguity detection. */
export function matchService(input: string | null | undefined, services = SERVICES): {
  top?: ServiceMatch;
  second?: ServiceMatch;
} {
  if (!input) return {};
  const needle = strip(input);
  if (!needle) return {};

  // Alias override first.
  for (const [alias, canonical] of SERVICE_ALIASES) {
    if (needle === strip(alias)) {
      const hit = services.find((s) => strip(s.name) === strip(canonical));
      if (hit) {
        return {
          top: {
            serviceId: hit.id, serviceName: hit.name,
            confidence: 0.95, source: `alias:${alias}`,
          },
        };
      }
    }
  }

  // Exact match on lowercased trim.
  const exact = services.find((s) => strip(s.name) === needle);
  if (exact) {
    return {
      top: { serviceId: exact.id, serviceName: exact.name, confidence: 1, source: "exact" },
    };
  }

  // Fall back to token jaccard ranking.
  const scored = services.map((s) => ({
    serviceId: s.id, serviceName: s.name,
    confidence: tokenJaccard(s.name, input),
    source: "fuzzy",
  })).sort((a, b) => b.confidence - a.confidence);

  const top = scored[0];
  const second = scored[1];
  if (!top || top.confidence < 0.34) return {};
  return { top, second };
}

/* ── Fee names — light aliasing for fee schedule rows ───────────────────── */

const FEE_NAME_ALIASES: Record<string, string> = {
  // raw lowercase prefix → canonical fee name fragment
  "minor use permit":          "Use Permit",
  "conditional use permit":    "Use Permit",
  "plan check fee":            "Plan check",
  "building permit fee":       "Building permit",
};

export function normalizeFeeName(input: string | null | undefined): Normalized<string> | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  for (const [alias, canonical] of Object.entries(FEE_NAME_ALIASES)) {
    if (s.toLowerCase().startsWith(alias)) {
      return { value: canonical, source: alias, confidence: 0.7 };
    }
  }
  return { value: s, source: "as-is", confidence: 1 };
}

/* ── Cost pools / centers — light aliasing for CAP rows ─────────────────── */

const POOL_ALIASES: Record<string, string> = {
  "general government":         "General Government Support",
  "it services":                "Information Technology",
  "info tech":                  "Information Technology",
  "human resources":            "Human Resources",
  "city manager":               "City Manager",
  "city attorney":              "City Attorney",
  "finance":                    "Finance",
  "facilities":                 "Facilities & Building Maintenance",
};

export function normalizeCostPool(input: string | null | undefined): Normalized<string> | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  for (const [alias, canonical] of Object.entries(POOL_ALIASES)) {
    if (s.toLowerCase().includes(alias)) {
      return { value: canonical, source: alias, confidence: 0.8 };
    }
  }
  return { value: s, source: "as-is", confidence: 1 };
}

/* ── Money parsing ──────────────────────────────────────────────────────── */

/** Parse a money-ish cell — handles $1,234.56, (1234) negatives, percent signs.
 *  Returns null if the cell isn't numeric at all. */
export function parseMoney(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = String(input).trim();
  if (!s) return null;
  // Strip surrounding parentheses (accounting negative).
  const neg = /^\(.*\)$/.test(s);
  if (neg) s = s.slice(1, -1);
  // Strip currency / commas / percent sign (we treat % as numeric — caller knows context).
  s = s.replace(/[$,]/g, "").replace(/\s+/g, "");
  if (s.endsWith("%")) s = s.slice(0, -1);
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}
