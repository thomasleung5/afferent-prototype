import type { CSSProperties, MouseEvent } from "react";

interface Props {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  "aria-label"?: string;
  disabled?: boolean;
  /** Optional style overrides merged on top of the default `×` button
   *  styling (transparent, ink-4, fontSize 14, lineHeight 1,
   *  `0 4px` padding). Use for one-off adjustments — most callers
   *  should pass nothing. */
  style?: CSSProperties;
}

/** Inline "×" remove control used in expandable-row drilldowns and
 *  delete columns. Transparent, no border, muted ink-4 glyph at
 *  fontSize 14, line-height 1, compact "0 4px" padding. Callers that
 *  need to stop propagation (so the click doesn't toggle the parent
 *  row's drilldown) handle it inside their `onClick` — the component
 *  hands the event through. */
export function RemoveIconButton({
  onClick, title, "aria-label": ariaLabel, disabled, style,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title}
      disabled={disabled}
      style={{
        color: "var(--ink-4)",
        fontSize: 14,
        lineHeight: 1,
        padding: "0 4px",
        background: "transparent",
        border: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >×</button>
  );
}
