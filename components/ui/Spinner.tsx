import type { CSSProperties } from "react";

/** Inline CSS spinner used beside loading text. Color follows
 *  `currentColor` from the parent — the import cards run it inside an
 *  `--ink-3` text block so it picks up the same dim treatment as the
 *  status line. The actual rotation lives in `src/index.css` so the
 *  keyframes can be reused without re-importing this component. */
export function Spinner({
  size = 12, ariaLabel = "Loading", style,
}: {
  size?: number;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className="spinner"
      role="status"
      aria-label={ariaLabel}
      style={{ width: size, height: size, ...style }}
    />
  );
}
