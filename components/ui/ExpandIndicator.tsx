/** Small rotating chevron used to signal an expandable row or section.
 *  Renders a monospace ▶ that rotates 90° and shifts to the accent color
 *  when `open`. The component is purely visual — wrap it in a clickable
 *  parent (button, span, table cell) that owns the toggle. */
export function ExpandIndicator({ open }: { open: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      fontSize: 9,
      color: open ? "var(--accent)" : "var(--ink-3)",
      transform: open ? "rotate(90deg)" : "none",
      transition: "transform 100ms",
      fontFamily: "var(--ff-mono)",
      lineHeight: 1,
    }}>▶</span>
  );
}
