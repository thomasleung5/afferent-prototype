import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/ui";

interface Checklist { l: string; v: string }
interface StatItem { l: string; v: string }

interface Props {
  eyebrow: string;
  title: string;
  desc: string;
  progress?: number;
  progressLabel?: string;
  cta: string;
  href: string;
  accent?: boolean;
  checklist?: Checklist[];
  stats?: StatItem[];
  support?: string;
}

/** Two-card workflow branch on the Home screen. `accent` flips the card to navy. */
export function EntryCard({
  eyebrow, title, desc,
  progress, progressLabel,
  cta, href,
  accent = false,
  checklist, stats, support,
}: Props) {
  const navy = "var(--navy)";
  const navyLine = "var(--navy-line)";
  const navySub = "var(--navy-sub)";
  const navyDim = "var(--navy-dim)";
  const charcoal = "var(--charcoal)";

  return (
    <Link to={href} style={{
      textAlign: "left",
      background: accent ? navy : "var(--paper)",
      color: accent ? "white" : "var(--ink)",
      border: accent ? `1px solid ${navy}` : "1px solid var(--rule)",
      padding: "26px 26px 22px",
      display: "flex", flexDirection: "column", gap: 12,
      minHeight: 240,
      textDecoration: "none",
    }}>
      <div className="mono" style={{
        fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: accent ? navyDim : "var(--ink-3)",
      }}>{eyebrow}</div>

      <div className="display" style={{
        fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.05,
      }}>{title}</div>

      <div style={{
        fontSize: "var(--fs-ui)",
        color: accent ? navySub : "var(--ink-2)",
        lineHeight: 1.55, textWrap: "pretty", maxWidth: 480,
      }}>{desc}</div>

      {checklist && (
        <div style={{
          display: "grid", gridTemplateColumns: `repeat(${checklist.length}, 1fr)`, gap: 12,
          marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--rule)",
        }}>
          {checklist.map((c, i) => (
            <div key={i}>
              <div className="mono" style={{
                fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
                textTransform: "uppercase", color: "var(--ink-3)",
              }}>{c.l}</div>
              <div className="num display" style={{
                fontSize: 26, fontWeight: 600, marginTop: 6, letterSpacing: "-0.02em",
                color: "var(--ink-2)",
              }}>{c.v}</div>
            </div>
          ))}
        </div>
      )}

      {stats && (
        <div style={{
          display: "grid",
          gridTemplateColumns: stats.length === 4 ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
          gap: 12,
          marginTop: 4, paddingTop: 12,
          borderTop: `1px solid ${accent ? navyLine : "var(--rule)"}`,
        }}>
          {stats.map((s, i) => (
            <div key={i}>
              <div className="mono" style={{
                fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: accent ? navyDim : "var(--ink-3)",
              }}>{s.l}</div>
              <div className="num display" style={{
                fontSize: 26, fontWeight: 600, marginTop: 6, letterSpacing: "-0.02em",
              }}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {support && (
        <div style={{
          fontSize: 12,
          color: accent ? navySub : "var(--ink-3)",
          lineHeight: 1.5,
        }}>{support}</div>
      )}

      <div style={{ marginTop: "auto", paddingTop: 16 }}>
        {progress != null && (
          <div style={{ marginBottom: 12 }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 12, color: accent ? navySub : "var(--ink-3)", marginBottom: 6,
            }}>
              <span>{progressLabel}</span>
              <span className="num">{progress}%</span>
            </div>
            <div style={{ height: 4, background: accent ? navyLine : "var(--paper-3)" }}>
              <div style={{
                height: "100%", width: `${progress}%`,
                background: accent ? "white" : "var(--accent)",
              }}/>
            </div>
          </div>
        )}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "9px 16px",
          background: accent ? "white" : charcoal,
          color: accent ? navy : "white",
          border: accent ? "none" : `1px solid ${charcoal}`,
          fontSize: "var(--fs-ui)", fontWeight: 500,
        }}>
          {cta} <Icon name="arrow-right" size={13}/>
        </div>
      </div>
    </Link>
  );
}
