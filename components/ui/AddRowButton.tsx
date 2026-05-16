interface Props {
  label: string;
  onClick: () => void;
}

/** Inline "+ Add ..." button used in operational table footers. Dashed-border
 *  ghost button — same visual everywhere. */
export function AddRowButton({ label, onClick }: Props) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 12, fontWeight: 500, color: "var(--accent)",
      padding: "4px 8px", border: "1px dashed var(--rule-strong)",
      background: "var(--paper)", cursor: "pointer",
    }}>
      + {label}
    </button>
  );
}
