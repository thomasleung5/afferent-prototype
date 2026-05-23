import type { ReactNode } from "react";
import { fmt } from "@/lib/format";
import { Btn, ExportCover, Icon, PrintStyles } from "@/components/ui";
import {
  useBenchmarkPayload,
} from "@/features/build/useBenchmarkExport";
import type { BenchmarkExportPayload } from "@/lib/export/benchmarkExcel";
import { useAutoPrint } from "@/lib/printing";

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
    <ExportCover
      city={payload.cityName}
      title="Fee Benchmark Database"
      subtitle="Adopted fees in peer cities · variance vs. peer median & calculated cost"
      fields={[
        { label: "Fiscal year",  value: payload.fiscal },
        { label: "Prepared by",  value: payload.preparedBy },
        { label: "Peer cities",  value: payload.peers.join(" · ") },
        { label: "Generated",    value: new Date(payload.generatedAt).toLocaleString() },
      ]}
    />
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

