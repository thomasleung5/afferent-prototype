import type { VolumeRow } from "../types";
import { SERVICES } from "./services";

/* Volume of Activity (annual count per service) layered on top of the
 * canonical service catalog. `prior` is the prior-study volume;
 * `current` is what's in the permit-system import for FY 26-27. All
 * seed rows carry source: "seed"; the status / flag mix below
 * exercises the review-state variety the UI needs to handle.
 *
 * Activity labels for the Volume page come from
 * `Service.activityLabel` — Services is the canonical owner. */

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
      source: "seed",
      status: "Reused",
      flag: "carry-forward",
    };
  }
  if (bucket === 7) {
    return {
      id: s.id,
      prior,
      current: s.volume,
      source: "seed",
      status: "Imported",
    };
  }
  if (bucket === 5) {
    return {
      id: s.id,
      prior,
      current: s.volume,
      source: "seed",
      status: "Manual",
    };
  }
  return {
    id: s.id,
    prior,
    current: s.volume,
    source: "seed",
    status: i % 4 === 0 ? "Validated" : "Imported",
  };
});
