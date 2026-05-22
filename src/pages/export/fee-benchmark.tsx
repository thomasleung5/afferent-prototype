import { useEffect } from "react";
import type { ReactNode } from "react";
import { fmt } from "@/lib/format";
import { Btn, Icon } from "@/components/ui";
import {
  useBenchmarkPayload,
} from "@/features/build/useBenchmarkExport";
import type { BenchmarkExportPayload } from "@/lib/export/benchmarkExcel";

type BenchmarkPayload = BenchmarkExportPayload;

export default function FeeBenchmarkExportPage() {
  const payload = useBenchmarkPayload();

  return (
    <>
      <PrintStyles/>
      <Toolbar payload={payload}/>
      <Report payload={payload}/>
    </>
  );
}

/** Print stylesheet — mirrors fee-study.tsx so both PDFs render identically. */
function PrintStyles() {
  return (
    <style>{`
      @page { size: letter portrait; margin: 0.6in 0.6in 0.7in 0.6in; }
      @media print {
        html, body { background: white !important; }
        .no-print { display: none !important; }
        .report { padding: 0 !important; max-width: none !important; margin: 0 !important; }
        .section-break { break-before: page; page-break-before: always; }
        .section-break:first-child { break-before: avoid; page-break-before: avoid; }
        .row { break-inside: avoid; page-break-inside: avoid; }
        table { break-inside: auto; page-break-inside: auto; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        .report, .report * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
      .report {
        max-width: 7.4in;
        margin: 0 auto;
        background: white;
        padding: 32px 32px 48px;
        color: var(--ink);
        font-family: var(--ff-ui), "IBM Plex Sans", system-ui, sans-serif;
      }
      .report h1, .report h2, .report h3 { letter-spacing: -0.01em; }
      .report .eyebrow {
        font-family: var(--ff-mono);
        font-size: 10px; font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ink-3);
      }
      .report .title { font-size: 24px; font-weight: 600; line-height: 1.15; }
      .report .h2 { font-size: 16px; font-weight: 600; margin: 0 0 10px; }
      .report .h3 { font-size: 13px; font-weight: 600; margin: 0 0 6px; }
      .report .body { font-size: 12.5px; color: var(--ink-2); line-height: 1.55; }
      .report table { width: 100%; border-collapse: collapse; font-size: 11px; }
      .report th, .report td { padding: 6px 8px; text-align: left; vertical-align: top; }
      .report th {
        font-family: var(--ff-mono);
        font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em;
        text-transform: uppercase; color: var(--ink-3);
        border-bottom: 1px solid var(--rule-strong);
        background: var(--paper-2);
      }
      .report td { border-bottom: 1px solid var(--rule); }
      .report td.num, .report th.num { text-align: right; font-variant-numeric: tabular-nums; }
      .report .total td {
        border-top: 1.5px solid var(--ink);
        border-bottom: none;
        background: var(--paper-2);
        font-weight: 600;
      }
      .report .mono { font-family: var(--ff-mono); }
    `}</style>
  );
}

function Toolbar({ payload }: { payload: BenchmarkPayload }) {
  return (
    <div className="no-print" style={{
      position: "sticky", top: 0, zIndex: 20,
      background: "var(--paper)",
      borderBottom: "1px solid var(--rule)",
      padding: "10px 24px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div className="mono" style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Export · Print preview</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {payload.cityName} · {payload.fiscal} fee benchmark
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      <Btn kind="ghost" onClick={() => window.close()}>Close</Btn>
      <Btn kind="primary" onClick={() => window.print()}>
        <Icon name="download" size={13}/> Print / Save PDF
      </Btn>
    </div>
  );
}

/** Auto-fire window.print on first load if the URL has ?print=1. */
function useAutoPrint() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") === "1") {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, []);
}

function Report({ payload }: { payload: BenchmarkPayload }) {
  useAutoPrint();
  return (
    <div className="report">
      <Cover payload={payload}/>
      <Summary payload={payload}/>
      <Method payload={payload}/>
      <BenchmarkTable payload={payload}/>
    </div>
  );
}

function Cover({ payload }: { payload: BenchmarkPayload }) {
  return (
    <section className="section" style={{
      paddingTop: 60, paddingBottom: 32,
      borderBottom: "1px solid var(--rule)",
      marginBottom: 36,
    }}>
      <div className="eyebrow">{payload.cityName}</div>
      <div className="title display" style={{ fontSize: 32, marginTop: 6 }}>
        Fee Benchmark Database
      </div>
      <div style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 12 }}>
        Adopted fees in peer cities · variance vs. peer median &amp; calculated cost
      </div>

      <div style={{
        marginTop: 36,
        display: "grid", gridTemplateColumns: "140px 1fr",
        gap: "6px 16px", fontSize: 12.5,
      }}>
        <Label>Fiscal year</Label>   <Value>{payload.fiscal}</Value>
        <Label>Prepared by</Label>   <Value>{payload.preparedBy}</Value>
        <Label>Peer cities</Label>   <Value>{payload.peers.join(" · ")}</Value>
        <Label>Generated</Label>     <Value>{new Date(payload.generatedAt).toLocaleString()}</Value>
      </div>
    </section>
  );
}

function Summary({ payload }: { payload: BenchmarkPayload }) {
  const s = payload.summary;
  return (
    <section className="section" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 1</div>
      <h2 className="h2">Summary</h2>
      <div className="body" style={{ maxWidth: 600 }}>
        {s.withPeer} of {s.total} fees have peer comparisons.{" "}
        <b>{s.aboveMedian}</b> are above the peer median by &gt;5%,{" "}
        <b>{s.belowMedian}</b> are below by &gt;5%, and <b>{s.inLine}</b> are
        within ±5% — for an average variance of{" "}
        <b>{s.avgVariance >= 0 ? "+" : ""}{Math.round(s.avgVariance)}%</b>{" "}
        relative to peer median.
      </div>

      <div style={{
        marginTop: 18,
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0,
        border: "1px solid var(--rule)",
      }}>
        <Tile label="Fees"           value={s.total.toString()}/>
        <Tile label="With peer data" value={s.withPeer.toString()}/>
        <Tile label="Above median"   value={s.aboveMedian.toString()} tone={s.aboveMedian > 0 ? "warn" : undefined} last/>
        <Tile label="In line"        value={s.inLine.toString()} tone="pos"/>
        <Tile label="Below median"   value={s.belowMedian.toString()} tone="warn"/>
        <Tile label="Avg variance"   value={`${s.avgVariance >= 0 ? "+" : ""}${Math.round(s.avgVariance)}%`} last/>
      </div>
    </section>
  );
}

function Method({ payload }: { payload: BenchmarkPayload }) {
  return (
    <section className="section" style={{ marginBottom: 36 }}>
      <div className="eyebrow">Section 2</div>
      <h2 className="h2">Method &amp; source</h2>
      <div className="body" style={{ maxWidth: 600 }}>
        <p style={{ margin: "0 0 8px" }}>
          Peer median is the central value across {payload.peers.length} comparable
          jurisdictions: <b>{payload.peers.join(", ")}</b>. Per-city values are
          stable samples around the median; the median itself is the authoritative
          benchmark number. Variance vs. median compares our adopted fee against
          the peer median. Variance vs. cost compares our adopted fee against the
          calculated unit cost (hours × FBHR).
        </p>
        <p style={{ margin: "0 0 8px" }}>
          <b style={{ color: "var(--ink)" }}>Caveat:</b> Peer fees are listed
          prices and may understate full cost recovery — peer cities may
          subsidize from general fund. The benchmark is a directional check
          on adopted pricing, not a substitute for the city&rsquo;s own cost
          of service analysis.
        </p>
        <p style={{ margin: 0 }}>
          Survey window: adopted fees as of Jul 1, 2025 · public schedules.
        </p>
      </div>
    </section>
  );
}

function BenchmarkTable({ payload }: { payload: BenchmarkPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 24 }}>
      <div className="eyebrow">Section 3</div>
      <h2 className="h2">Fee benchmark</h2>
      <div className="body" style={{ marginBottom: 14, maxWidth: 600 }}>
        Every fee with its adopted price, the per-city peer values, the peer
        median, and the variance against both the median and our calculated
        unit cost.
      </div>
      <table>
        <thead>
          <tr>
            <th>Fee item</th>
            <th>Dept</th>
            <th className="num">Our fee</th>
            {payload.peers.map((c) => (
              <th key={c} className="num">{c}</th>
            ))}
            <th className="num">Median</th>
            <th className="num">vs Median</th>
            <th className="num">vs Cost</th>
          </tr>
        </thead>
        <tbody>
          {payload.rows.map((r) => (
            <tr key={r.id}>
              <td>
                <div>{r.name}</div>
                <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 2 }}>{r.id}</div>
              </td>
              <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{r.dept}</span></td>
              <td className="num">{fmt.dollars(r.fee)}</td>
              {r.peerValues.map((v, i) => (
                <td key={i} className="num" style={{ color: "var(--ink-3)" }}>
                  {v > 0 ? fmt.dollars(v) : "—"}
                </td>
              ))}
              <td className="num">{r.peerMedian > 0 ? fmt.dollars(r.peerMedian) : "—"}</td>
              <td className="num" style={{
                color: r.peerMedian <= 0 ? "var(--ink-4)"
                  : r.varianceVsMedian > 5 ? "var(--neg)"
                  : r.varianceVsMedian < -5 ? "var(--warn)"
                  : "var(--pos)",
              }}>
                {r.peerMedian > 0
                  ? <b>{r.varianceVsMedian > 0 ? "+" : ""}{Math.round(r.varianceVsMedian)}%</b>
                  : "—"}
              </td>
              <td className="num" style={{
                color: r.cost <= 0 ? "var(--ink-4)"
                  : r.varianceVsCost < -10 ? "var(--neg)"
                  : "var(--ink)",
              }}>
                {r.cost > 0
                  ? `${r.varianceVsCost > 0 ? "+" : ""}${Math.round(r.varianceVsCost)}%`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Tile({
  label, value, tone, last,
}: { label: string; value: string; tone?: "pos" | "neg" | "warn"; last?: boolean }) {
  const color =
    tone === "pos" ? "var(--pos)" :
    tone === "neg" ? "var(--neg)" :
    tone === "warn" ? "var(--warn)" :
    "var(--ink)";
  return (
    <div style={{
      padding: "12px 14px",
      borderRight: last ? "none" : "1px solid var(--rule)",
      borderBottom: "1px solid var(--rule)",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div className="mono" style={{
        fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div className="num" style={{
        fontSize: 20, fontWeight: 600, color, letterSpacing: "-0.01em",
      }}>{value}</div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
      color: "var(--ink-3)", textTransform: "uppercase",
    }}>{children}</div>
  );
}

function Value({ children }: { children: ReactNode }) {
  return <div style={{ color: "var(--ink-2)" }}>{children}</div>;
}
