import type { MouseEvent } from "react";

interface Props {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  "aria-label"?: string;
}

/** Inline "×" remove control used in expandable-row drilldowns and
 *  delete columns. Transparent, no border, muted ink-4 glyph at
 *  fontSize 14, line-height 1, compact "0 4px" padding. Callers that
 *  need to stop propagation (so the click doesn't toggle the parent
 *  row's drilldown) handle it inside their `onClick` — the component
 *  hands the event through. */
export function RemoveIconButton({
  onClick, title, "aria-label": ariaLabel,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title}
      style={{
        color: "var(--ink-4)",
        fontSize: 14,
        lineHeight: 1,
        padding: "0 4px",
        background: "transparent",
        border: 0,
        cursor: "pointer",
      }}
    >×</button>
  );
}
