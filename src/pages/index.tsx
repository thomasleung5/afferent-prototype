import { Page } from "@/components/layout";
import { Btn, Icon } from "@/components/ui";
import { CITY } from "@/lib/data/city";
import { CITYWIDE } from "@/lib/data/citywide";
import { fmt } from "@/lib/format";
import { EntryCard } from "@/features/home/EntryCard";
import { AuditTrail } from "@/features/home/AuditTrail";
import { ModelInputs } from "@/features/home/ModelInputs";

export default function HomePage() {
  const gap = CITYWIDE.gap;
  const recovery = CITYWIDE.recovery;

  return (
    <Page>
      {/* Document header */}
      <div style={{
        borderBottom: "1px solid var(--rule)",
        paddingBottom: 18, marginBottom: -4,
      }}>
        <div className="mono" style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--ink-3)",
        }}>{CITY.name}</div>
        <div className="display" style={{
          fontSize: 26, fontWeight: 600, letterSpacing: "-0.018em",
          lineHeight: 1.15, marginTop: 4,
        }}>Revenue Intelligence System</div>
      </div>

      {/* Headline answer */}
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        padding: "28px 32px",
        display: "flex", justifyContent: "space-between",
        alignItems: "center", gap: 24, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div className="mono" style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--ink-3)",
          }}>Citywide cost recovery</div>
          <div className="display" style={{
            fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1,
          }}>
            <span className="num" style={{ color: "var(--neg)" }}>{fmt.dollarsK(gap)}/yr</span>
            {" "}
            <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>
              under-recovery at {recovery.toFixed(0)}%
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
            See the full breakdown — cost drivers, recovery shortfalls, and source lineage — on the Revenue Gap tab.
          </div>
        </div>
        <Btn kind="primary" href="/gap">
          Open Revenue Gap <Icon name="arrow-right" size={13}/>
        </Btn>
      </div>

      {/* Workflow branch */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <EntryCard
          eyebrow="First-time setup"
          title="Build cost-of-service model"
          desc="Define services, build the salary table, allocate costs, and lock the cost of service."
          progress={74}
          progressLabel="Baseline model — staff validation in progress"
          cta="Configure model"
          href="/build"
          checklist={[
            { l: "Services", v: "32 mapped" },
            { l: "Labor",    v: "73 positions" },
            { l: "Overhead", v: "14 pools" },
            { l: "Fees",     v: "Recovery targets" },
          ]}
        />
        <EntryCard
          eyebrow="Recurring workflow"
          title="Annual update"
          desc="Refresh the inputs that change each year. Reuse everything else. Generate the Council packet."
          progress={91}
          progressLabel="Structure reused: 91%"
          cta="Run Annual Update"
          href="/annual"
          accent
          stats={[
            { l: "Changes to review", v: "12" },
            { l: "Recovery drift",    v: "+$420K" },
            { l: "Est. review time",  v: "2.5 hrs" },
          ]}
        />
      </div>

      {/* Activity & inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <AuditTrail/>
        <ModelInputs/>
      </div>
    </Page>
  );
}
