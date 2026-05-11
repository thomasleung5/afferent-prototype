"use client";

import { EditableNumber, EditableText, Btn, Icon } from "@/components/ui";
import { useBuildState } from "./BuildContext";

export function PolicyExceptions() {
  const { policyExceptions, updatePolicyException, addPolicyException, removePolicyException } = useBuildState();

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1.4fr) 120px minmax(220px, 2fr) 36px",
        gap: 16,
        padding: "12px 20px",
        borderBottom: "1px solid var(--rule)",
        fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
        letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        <div>Fee</div>
        <div style={{ textAlign: "right" }}>Target</div>
        <div>Policy note</div>
        <div/>
      </div>
      {policyExceptions.length === 0 && (
        <div style={{
          padding: "18px 20px", textAlign: "center",
          color: "var(--ink-3)", fontSize: 12.5,
        }}>
          No exceptions yet. Department targets apply to every fee.
        </div>
      )}
      {policyExceptions.map((e, i) => (
        <div key={e.id} style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1.4fr) 120px minmax(220px, 2fr) 36px",
          gap: 16,
          padding: "10px 20px",
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
              color: "var(--ink-3)", background: "transparent",
              border: "1px solid var(--rule)",
              cursor: "pointer",
            }}
          >
            <Icon name="close" size={11}/>
          </button>
        </div>
      ))}
      <div style={{
        padding: "10px 20px",
        borderTop: "1px solid var(--rule-strong)",
        background: "var(--paper-2)",
      }}>
        <Btn kind="subtle" onClick={addPolicyException}>
          <Icon name="plus" size={12}/> Add exception
        </Btn>
      </div>
    </div>
  );
}
