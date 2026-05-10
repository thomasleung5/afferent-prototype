import type { EnrichedService, Service } from "./types";

export function enrichServices(services: Service[]): EnrichedService[] {
  return services
    .map((s) => {
      const recovery = s.cost > 0 ? (s.fee / s.cost) * 100 : 0;
      const gap = (s.cost - s.fee) * s.volume;
      return { ...s, recovery, gap };
    })
    .sort((a, b) => b.gap - a.gap);
}

export interface TopFix extends EnrichedService {
  /** Recommended fee at target recovery, snapped to $5. */
  recommended: number;
  /** Annual revenue lift if recommended fee is adopted. */
  annualUplift: number;
}

export function topFixes(services: Service[], limit = 6): TopFix[] {
  return services
    .map<TopFix>((s) => {
      const recommended = Math.round((s.cost * (s.target || 100)) / 100 / 5) * 5;
      const recovery = s.cost > 0 ? (s.fee / s.cost) * 100 : 0;
      const gap = (s.cost - s.fee) * s.volume;
      const annualUplift = (recommended - s.fee) * s.volume;
      return { ...s, recovery, gap, recommended, annualUplift };
    })
    .filter((s) => s.annualUplift > 0)
    .sort((a, b) => b.annualUplift - a.annualUplift)
    .slice(0, limit);
}
