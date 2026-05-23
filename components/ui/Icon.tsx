import type { CSSProperties } from "react";

/** Icon set actually rendered by the app. Glyphs with zero call sites
 *  have been removed; reintroduce as needed when a consumer lands. */
type IconName =
  | "arrow-right"
  | "arrow-up-to-line"
  | "download"
  | "check"
  | "close"
  | "sparkles"
  | "database";

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 16, color = "currentColor", style }: Props) {
  const props = {
    width: size, height: size, viewBox: "0 0 16 16",
    fill: "none", stroke: color, strokeWidth: 1.5,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    style,
  };
  switch (name) {
    case "arrow-right":   return <svg {...props}><path d="M3 8h10M9 4l4 4-4 4"/></svg>;
    case "arrow-up-to-line": return <svg {...props}><path d="M3 2h10M8 5v9M4 8l4-3 4 3"/></svg>;
    case "download":      return <svg {...props}><path d="M8 2v9M4 8l4 3 4-3M3 14h10"/></svg>;
    case "check":         return <svg {...props}><path d="M3 8.5l3 3 7-7"/></svg>;
    case "close":         return <svg {...props}><path d="M3 3l10 10M13 3L3 13"/></svg>;
    case "sparkles":      return <svg {...props}><path d="M9 2.5l1.1 2.4 2.4 1.1-2.4 1.1L9 9.5 7.9 7.1 5.5 6l2.4-1.1L9 2.5Z"/><path d="M4 10l.7 1.4 1.4.6-1.4.6L4 14l-.7-1.4L1.9 12l1.4-.6L4 10Z"/></svg>;
    case "database":      return <svg {...props}><ellipse cx="8" cy="3.5" rx="5" ry="1.5"/><path d="M3 3.5v3c0 .83 2.24 1.5 5 1.5s5-.67 5-1.5v-3"/><path d="M3 8.5v3c0 .83 2.24 1.5 5 1.5s5-.67 5-1.5v-3"/></svg>;
  }
}
