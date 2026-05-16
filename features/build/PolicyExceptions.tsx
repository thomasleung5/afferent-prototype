
import { AddRowButton, EditableNumber, EditableText, Icon } from "@/components/ui";
import { useBuildState } from "@/lib/store";

export function PolicyExceptions() {
  const { policyExceptions, updatePolicyException, addPolicyException, removePolicyException } = useBuildState();

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1.4fr) 120px minmax(220px, 2fr) 36px",
        columnGap: 28,
        padding: "9px 16px",
        borderBottom: "1px solid var(--rule)",
        background: "var(--paper-2)",
        fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        <div>Fee</div>
        <div style={{ textAlign: "right" }}>Target</div>
        <div>Policy note</div>
        <div/>
      </div>
      {policyExceptions.length === 0 && (
        <div style={{
          padding: "18px 16px", textAlign: "center",
          color: "var(--ink-3)", fontSize: 12.5,
        }}>
          No exceptions yet. Department targets apply to every fee.
        </div>
      )}
      {policyExceptions.map((e, i) => (
        <div key={e.id} style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1.4fr) 120px minmax(220px, 2fr) 36px",
          columnGap: 28,
          padding: "12px 16px",
          borderBottom: i < policyExceptions.length - 1 ? "1px solid var(--rule)" : "none",
          alignItems: "center",
        }}>
          <EditableText
            value={e.fee}
            onChange={(v) => updatePolicyException(e.id, { fee: v })}
            placeholder="Fee name"
            compact
            bold
          />
          <EditableNumber
            value={e.target}
            onChange={(v) => updatePolicyException(e.id, { target: v })}
            suffix="%"
            min={0}
            max={200}
            align="right"
            compact
            bold
          />
          <EditableText
            value={e.note}
            onChange={(v) => updatePolicyException(e.id, { note: v })}
            placeholder="Optional policy note"
            compact
          />
          <button
            onClick={() => removePolicyException(e.id)}
            title="Remove exception"
            aria-label="Remove exception"
            style={{
              width: 24, height: 24,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "var(--ink-4)", background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Icon name="close" size={11}/>
          </button>
        </div>
      ))}
      <div style={{
        padding: "10px 16px",
        borderTop: "1px solid var(--rule-strong)",
        background: "var(--paper-2)",
      }}>
        <AddRowButton label="Add fee exception" onClick={addPolicyException}/>
      </div>
    </div>
  );
}
