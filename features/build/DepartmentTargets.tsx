
import { CellInput, DeptChip } from "@/components/ui";
import { DEPTS } from "@/lib/data/departments";
import { useBuildState } from "@/lib/store";

function intent(target: number): string {
  if (target >= 100) return "Full cost recovery";
  if (target >=  80) return "Near-full recovery";
  if (target >=  60) return "Partial recovery";
  return "Subsidized service";
}

function Bar({ pct }: { pct: number }) {
  return (
    <div style={{
      width: 110, height: 4,
      background: "var(--paper-3)",
      position: "relative",
    }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: `${Math.max(0, Math.min(100, pct))}%`,
        background: "var(--ink-2)",
      }}/>
    </div>
  );
}

export function DepartmentTargets() {
  const { policyTargets, updatePolicyTarget } = useBuildState();

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(200px, 1.4fr) 240px minmax(200px, 2fr)",
        columnGap: 28,
        padding: "9px 16px",
        borderBottom: "1px solid var(--rule)",
        background: "var(--paper-2)",
        fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        <div>Department</div>
        <div>Target Recovery</div>
        <div>Notes</div>
      </div>
      {policyTargets.map((t, i) => (
        <div key={t.id} style={{
          display: "grid",
          gridTemplateColumns: "minmax(200px, 1.4fr) 240px minmax(200px, 2fr)",
          columnGap: 28,
          padding: "12px 16px",
          borderBottom: i < policyTargets.length - 1 ? "1px solid var(--rule)" : "none",
          alignItems: "center",
        }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <DeptChip code={t.dept}/>
            <span style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 500 }}>
              {DEPTS[t.dept].name.replace(" Administration", "")}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Bar pct={t.target}/>
            <div style={{ width: 70 }}>
              <CellInput
                type="number"
                value={t.target}
                onChange={(v) => updatePolicyTarget(t.id, { target: Number(v) || 0 })}
                suffix="%"
                min={0}
                max={100}
                align="right"
              />
            </div>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{intent(t.target)}</span>
          </div>
          <CellInput
            value={t.note}
            onChange={(v) => updatePolicyTarget(t.id, { note: String(v) })}
            placeholder="Optional policy note"
          />
        </div>
      ))}
    </div>
  );
}
