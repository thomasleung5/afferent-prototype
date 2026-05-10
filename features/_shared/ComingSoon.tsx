interface Props {
  legacyFile: string;
}

/** Placeholder shown for routes whose feature hasn't been migrated yet.
 *  The `legacyFile` prop points the implementer at the original JSX. */
export function ComingSoon({ legacyFile }: Props) {
  return (
    <div style={{
      background: "var(--paper)", border: "1px dashed var(--rule-strong)",
      padding: "28px 32px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div className="mono" style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "var(--ink-3)",
      }}>Not yet migrated</div>
      <div style={{
        fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 640,
      }}>
        This route still needs to be ported from the original prototype.
        See <span className="mono" style={{ color: "var(--ink)" }}>_legacy/{legacyFile}</span>.
      </div>
      <div style={{
        fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55, maxWidth: 640,
      }}>
        Pattern: extract data into <span className="mono">lib/data/</span>,
        create a folder under <span className="mono">features/&lt;feature&gt;/</span> for
        feature-specific components, and add the page at this route. Reuse{" "}
        <span className="mono">components/ui</span>,{" "}
        <span className="mono">components/layout</span>, and{" "}
        <span className="mono">components/table</span>.
      </div>
    </div>
  );
}
