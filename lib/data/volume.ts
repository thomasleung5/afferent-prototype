import type { VolumeRow } from "../types";
import { SERVICES } from "./services";

/* Volume of Activity (annual count per service) layered on top of the
 * canonical service catalog. `prior` is the prior-study volume; `current` is
 * what's in the permit-system import for FY 26-27. All seed rows carry
 * source: "seed" (the status / flag mix below simulates the legacy
 * review-state variety). */

function vary(volume: number, i: number): number {
  return Math.max(1, Math.round(volume * (0.85 + (i % 5) * 0.06)));
}

export const VOLUME: VolumeRow[] = SERVICES.map((s, i): VolumeRow => {
  const bucket = i % 13;
  const prior = vary(s.volume, i);

  if (bucket === 3 || bucket === 11) {
    return {
      id: s.id,
      prior,
      current: prior,
      unit: unitFor(s.id, s.dept),
      source: "seed",
      status: "Reused",
      flag: "carry-forward",
    };
  }
  if (bucket === 7) {
    return {
      id: s.id,
      prior,
      current: null,
      unit: unitFor(s.id, s.dept),
      source: "seed",
      status: "Missing",
      flag: "missing-current-volume",
    };
  }
  if (bucket === 5) {
    return {
      id: s.id,
      prior,
      current: s.volume,
      unit: unitFor(s.id, s.dept),
      source: "seed",
      status: "Manual",
    };
  }
  return {
    id: s.id,
    prior,
    current: s.volume,
    unit: unitFor(s.id, s.dept),
    source: "seed",
    status: i % 4 === 0 ? "Validated" : "Imported",
  };
});

function unitFor(id: string, dept: string): string {
  if (/-pc$|-apr$|-fpc$|-pchk/.test(id)) return "Plan check";
  if (/-insp|-erosion|-ai\b|-bldg/.test(id)) return "Inspection";
  if (/-sfr$|-rem$|-pool$|-solar$|-mep$|-tco$|-ext$/.test(id)) return "Permit";
  if (/-ency|-encl|-grade|-storm/.test(id)) return "Permit";
  if (/-preap|-adu/.test(id)) return "Meeting";
  if (/-fence|-oak|-mod|-wlss|-mvar/.test(id)) return "Permit";
  if (dept === "PLAN") return "Application";
  if (dept === "BLDG") return "Permit";
  if (dept === "ENG")  return "Review";
  return "Item";
}
