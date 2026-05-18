
import { KpiTile, SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { CapPool } from "@/lib/types";
import type { CapStepDownMethod } from "@/lib/data/capStepDown";
import { defaultCenterOrder, useBuildState } from "@/lib/store";

/** Reduce pools → centers (name, total $, pool count). Stable ordering comes
 *  from `capCenterOrder` (with any newly-imported centers appended). */
interface CenterRow {
  name: string;
  total: number;
  pools: number;
}

export function deriveCenters(pools: CapPool[], order: string[]): CenterRow[] {
  const map = new Map<string, { total: number; pools: number }>();
  for (const p of pools) {
    const cur = map.get(p.center) ?? { total: 0, pools: 0 };
    cur.total += p.amount;
    cur.pools += 1;
    map.set(p.center, cur);
  }
  const seen = new Set<string>();
  const out: CenterRow[] = [];
  for (const name of order) {
    const m = map.get(name);
    if (!m) continue;
    out.push({ name, total: m.total, pools: m.pools });
    seen.add(name);
  }
  // Append centers the saved order doesn't know about (e.g. fresh imports).
  for (const name of defaultCenterOrder(pools)) {
    if (seen.has(name)) continue;
    const m = map.get(name);
    if (!m) continue;
    out.push({ name, total: m.total, pools: m.pools });
  }
  return out;
}

export function CapKpiRail() {
  const { capPools, capCenterOrder } = useBuildState();
  const centers = deriveCenters(capPools, capCenterOrder);
  const total = centers.reduce((a, c) => a + c.total, 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      <KpiTile
        label="Total CAP scope"
        value={fmt.dollarsK(total)}
        sub={`${centers.length} cost centers`}
      />
      <KpiTile
        label="Indirect departments"
        value={centers.length}
        sub="Allocate FROM these"
      />
      <KpiTile
        label="Direct departments"
        value={3}
        sub="Allocate TO these"
      />
      <KpiTile
        label="Cost pools"
        value={capPools.length}
        sub="Distinct allocation rules"
      />
    </div>
  );
}

/** Step-down sequence — ordered cost centers, each with its $ total and
 *  up/down reorder buttons. Order is persisted in `capCenterOrder` and used
 *  by the downstream step-down engine. */
export function StepDownSequence() {
  const { capPools, capCenterOrder, capStepDownMethod, setCapStepDownMethod, moveCenter } = useBuildState();
  const centers = deriveCenters(capPools, capCenterOrder);

  return (
    <div>
      <SectionLabel
        right={
          <MethodToggle
            value={capStepDownMethod}
            onChange={setCapStepDownMethod}
          />
        }
      >
        Step-down sequence
      </SectionLabel>
      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
        {centers.map((c, i) => {
          const isFirst = i === 0;
          const isLast = i === centers.length - 1;
          // Bottom border except on the last row; right border except on the
          // rightmost column.
          const lastRowStart = centers.length - (centers.length % 3 || 3);
          return (
            <div key={c.name} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px",
              borderBottom: i < lastRowStart ? "1px solid var(--rule)" : "none",
              borderRight: (i + 1) % 3 !== 0 ? "1px solid var(--rule)" : "none",
            }}>
              <div className="mono" style={{
                fontSize: 11, fontWeight: 700,
                padding: "3px 8px", minWidth: 30, textAlign: "center",
                background: "var(--ink)", color: "var(--paper)",
                fontVariantNumeric: "tabular-nums",
              }}>{(i + 1).toString().padStart(2, "0")}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 500,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{c.name}</div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 1 }}>
                  {c.total > 0 ? fmt.dollarsK(c.total) : "—"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <ReorderBtn dir="up"   disabled={isFirst} onClick={() => moveCenter(c.name, "up")}/>
                <ReorderBtn dir="down" disabled={isLast}  onClick={() => moveCenter(c.name, "down")}/>
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function MethodToggle({
  value,
  onChange,
}: {
  value: CapStepDownMethod;
  onChange: (method: CapStepDownMethod) => void;
}) {
  const options: { value: CapStepDownMethod; label: string; title: string }[] = [
    {
      value: "step-down",
      label: "Step-down",
      title: "Sequential elimination: each center allocates to later indirect centers and direct departments.",
    },
    {
      value: "double-step-down",
      label: "Double step-down",
      title: "First allocate to other indirect and direct receivers, then re-allocate indirect receipts to direct departments.",
    },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="CAP allocation method"
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: "1px solid var(--rule)",
        background: "var(--paper)",
      }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            onClick={() => onChange(option.value)}
            style={{
              border: "none",
              borderLeft: option.value === options[0].value ? "none" : "1px solid var(--rule)",
              background: selected ? "var(--ink)" : "transparent",
              color: selected ? "var(--paper)" : "var(--ink-3)",
              cursor: "pointer",
              padding: "4px 9px",
              fontFamily: "var(--ff-ui)",
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ReorderBtn({
  dir, disabled, onClick,
}: { dir: "up" | "down"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={dir === "up" ? "Move earlier in sequence" : "Move later in sequence"}
      aria-label={dir === "up" ? "Move up" : "Move down"}
      style={{
        width: 22, height: 16,
        border: "1px solid var(--rule)", background: "var(--paper)",
        color: disabled ? "var(--ink-4)" : "var(--ink-2)",
        cursor: disabled ? "default" : "pointer",
        fontSize: 9, lineHeight: 1, padding: 0,
      }}
    >{dir === "up" ? "▲" : "▼"}</button>
  );
}
