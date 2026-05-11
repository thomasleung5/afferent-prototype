
import { Drawer, DeptChip } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { Service } from "@/lib/types";
import type { FBHR } from "@/lib/calc";
import { Section, Row, Formula } from "./ServiceDetail";

interface Props {
  service: Service | null;
  fbhr: FBHR | null;
  onClose: () => void;
}

/** Read-only audit trail for a service's cost. Cost of Service is the rollup —
 *  edits happen upstream in Direct Labor / Operating / CAP / Workload / Services. */
export function CostTrace({ service, fbhr, onClose }: Props) {
  if (!service || !fbhr) return null;
  const directDollars = service.hours * fbhr.directRate;
  const operatingDollars = service.hours * fbhr.operatingRate;
  const capDollars = service.hours * fbhr.capRate;
  const unitCost = service.hours * fbhr.fbhr;
  const annualCost = unitCost * service.volume;
  const annualRevenue = service.fee * service.volume;
  const recoveryPct = unitCost > 0 ? (service.fee / unitCost) * 100 : 0;

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Cost trace"
      title={service.name}
      subtitle={<span><DeptChip code={service.dept}/> <span className="mono" style={{ marginLeft: 6 }}>{service.id}</span></span>}
      width={560}
    >
      <Section title="Inputs (upstream)">
        <Row label="Hours / instance">{service.hours} h — edit in <b style={{ color: "var(--ink-2)" }}>Services</b></Row>
        <Row label="Volume / yr">{service.volume.toLocaleString()} — edit in <b style={{ color: "var(--ink-2)" }}>Workload</b></Row>
        <Row label="Direct $/hr">${Math.round(fbhr.directRate)} — from <b style={{ color: "var(--ink-2)" }}>Direct Labor</b></Row>
        <Row label="Operating $/hr">${Math.round(fbhr.operatingRate)} — from <b style={{ color: "var(--ink-2)" }}>Operating</b></Row>
        <Row label="CAP $/hr">${Math.round(fbhr.capRate)} — from <b style={{ color: "var(--ink-2)" }}>Cost Allocation</b></Row>
      </Section>

      <Section title="① Rate composition">
        <Formula
          parts={[
            { l: "Direct $/hr",      v: `$${Math.round(fbhr.directRate)}` },
            { l: "+ Operating $/hr", v: `$${Math.round(fbhr.operatingRate)}` },
            { l: "+ CAP $/hr",       v: `$${Math.round(fbhr.capRate)}` },
            { l: "= FBHR",           v: `$${Math.round(fbhr.fbhr)}/hr`, bold: true },
          ]}
        />
      </Section>

      <Section title="② Unit cost build-up">
        <Formula
          parts={[
            { l: "Hours × Direct $/hr",    v: fmt.dollars(directDollars) },
            { l: "+ Hours × Operating",    v: fmt.dollars(operatingDollars) },
            { l: "+ Hours × CAP",          v: fmt.dollars(capDollars) },
            { l: "= Unit cost",            v: fmt.dollars(unitCost), bold: true },
          ]}
        />
      </Section>

      <Section title="③ Annual">
        <Formula
          parts={[
            { l: "Unit cost",        v: fmt.dollars(unitCost) },
            { l: "× Volume / yr",    v: service.volume.toLocaleString() },
            { l: "= Annual cost",    v: fmt.dollarsK(annualCost), bold: true },
            { l: "Current fee × vol", v: fmt.dollarsK(annualRevenue) },
            { l: "Recovery",         v: `${recoveryPct.toFixed(0)}%`, bold: true },
          ]}
        />
      </Section>

      <div style={{
        marginTop: 6, paddingTop: 14, borderTop: "1px dashed var(--rule)",
        fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.55,
      }}>
        Every number is traceable to source inputs. To change this cost, edit
        the upstream node — links above tell you which screen owns each input.
      </div>
    </Drawer>
  );
}
