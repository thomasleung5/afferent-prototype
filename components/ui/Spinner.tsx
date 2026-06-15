import type { CSSProperties } from "react";

/** Inline loading indicator used beside upload status text. SVG-based:
 *  a faint full-ring track plus a denser quarter-arc that rotates via
 *  the `.spinner` keyframes in `src/index.css`. Strokes inherit color
 *  from the parent's `currentColor`, so the import cards keep their
 *  `--ink-3` treatment without extra props. The previous border-based
 *  U-shape was visually ambiguous at small sizes; the track + arc reads
 *  as a clear circular progress indicator instead. */
export function Spinner({
  size = 12, ariaLabel = "Loading", style,
}: {
  size?: number;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className="spinner"
      role="status"
      aria-label={ariaLabel}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
    >
      {/* Full-ring track at low opacity — communicates the "circle" so
          the moving arc reads as progress, not as a broken shape. */}
      <circle
        cx="12" cy="12" r="9"
        stroke="currentColor" strokeOpacity="0.25" strokeWidth="3"
      />
      {/* Quarter arc — the visible sweep. strokeLinecap="round" keeps
          the ends soft at small sizes (12px default). */}
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor" strokeWidth="3" strokeLinecap="round"
      />
    </svg>
  );
}
