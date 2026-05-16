import { Link } from "@tanstack/react-router";
import { Page } from "@/components/layout";
import { Btn, Icon } from "@/components/ui";
import { CITY } from "@/lib/data/city";
import { CITYWIDE } from "@/lib/data/citywide";
import { fmt } from "@/lib/format";
import { EntryCard } from "@/features/home/EntryCard";
import { AuditTrail } from "@/features/home/AuditTrail";

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
            fontSize: 40, fontWeight: 600, letterSpacing: "-0.024em", lineHeight: 1.08,
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

      {/* Workflow branch — setup + operations */}
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
          eyebrow="Operating layer"
          title="Revenue monitoring"
          desc="Track recovery drift, subsidy exposure, and fee actions after adoption."
          progress={57}
          progressLabel="Recovery health declining since adoption"
          cta="Open monitoring"
          href="/monitoring"
          accent
          stats={[
            { l: "Revenue drift",      v: "+$412K" },
            { l: "Recovery health",    v: "57%" },
            { l: "Fees below target",  v: "25" },
          ]}
          support="3 departments below policy · 7 stale assumptions"
        />
      </div>

      {/* Recurring workflow — Annual update as a horizontal strip */}
      <Link to="/annual" style={{
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        padding: "22px 26px",
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1.3fr) minmax(360px, 1.6fr) auto",
        columnGap: 32, rowGap: 16,
        alignItems: "center",
        color: "var(--ink)",
        textDecoration: "none",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div className="mono" style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--ink-3)",
          }}>Recurring workflow</div>
          <div className="display" style={{
            fontSize: 24, fontWeight: 600, letterSpacing: "-0.018em", lineHeight: 1.15,
          }}>Annual update</div>
          <div style={{
            fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, textWrap: "pretty",
            maxWidth: 420,
          }}>
            Refresh the inputs that change each year. Reuse everything else. Generate the Council packet.
          </div>
          <div style={{
            fontSize: 12, color: "var(--ink-3)", lineHeight: 1.55, marginTop: 2,
          }}>
            Monitoring identified material recovery drift since FY 2025–26 adoption.
          </div>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16,
        }}>
          {[
            { l: "Changes to review", v: "12" },
            { l: "Structure reused",  v: "91%" },
            { l: "Est. review time",  v: "2.5 hrs" },
            { l: "Fees impacted",     v: "25" },
          ].map((s) => (
            <div key={s.l}>
              <div className="mono" style={{
                fontSize: 9.5, fontWeight: 600, letterSpacing: "0.12em",
                textTransform: "uppercase", color: "var(--ink-3)",
              }}>{s.l}</div>
              <div className="num display" style={{
                fontSize: 22, fontWeight: 600, marginTop: 5, letterSpacing: "-0.015em",
              }}>{s.v}</div>
            </div>
          ))}
        </div>

        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "9px 16px",
          background: "var(--charcoal)",
          color: "white",
          border: "1px solid var(--charcoal)",
          fontSize: 13, fontWeight: 500,
          whiteSpace: "nowrap",
        }}>
          Run annual update <Icon name="arrow-right" size={13}/>
        </div>
      </Link>

      {/* Activity */}
      <AuditTrail/>
    </Page>
  );
}
