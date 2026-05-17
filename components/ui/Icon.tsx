import type { CSSProperties } from "react";

export type IconName =
  | "arrow-right" | "arrow-left"
  | "arrow-up-to-line"
  | "chevron-right" | "chevron-down"
  | "download" | "search" | "filter"
  | "dot" | "share" | "sort" | "plus"
  | "check" | "close" | "info"
  | "sparkles" | "database" | "rotate-ccw";

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
    case "arrow-left":    return <svg {...props}><path d="M13 8H3M7 4 3 8l4 4"/></svg>;
    case "arrow-up-to-line": return <svg {...props}><path d="M3 2h10M8 5v9M4 8l4-3 4 3"/></svg>;
    case "chevron-right": return <svg {...props}><path d="M6 3l5 5-5 5"/></svg>;
    case "chevron-down":  return <svg {...props}><path d="M3 6l5 5 5-5"/></svg>;
    case "download":      return <svg {...props}><path d="M8 2v9M4 8l4 3 4-3M3 14h10"/></svg>;
    case "search":        return <svg {...props}><circle cx="7" cy="7" r="4.5"/><path d="M13 13l-2.8-2.8"/></svg>;
    case "filter":        return <svg {...props}><path d="M2 3h12l-4.5 5.5V13L6.5 14.5v-6Z"/></svg>;
    case "dot":           return <svg {...props}><circle cx="8" cy="8" r="2" fill={color}/></svg>;
    case "share":         return <svg {...props}><path d="M3 8.5V13h10V8.5M8 2v8M5 5l3-3 3 3"/></svg>;
    case "sort":          return <svg {...props}><path d="M4 3v10M4 13l-2-2M4 13l2-2M12 13V3M12 3l-2 2M12 3l2 2"/></svg>;
    case "plus":          return <svg {...props}><path d="M8 3v10M3 8h10"/></svg>;
    case "check":         return <svg {...props}><path d="M3 8.5l3 3 7-7"/></svg>;
    case "close":         return <svg {...props}><path d="M3 3l10 10M13 3L3 13"/></svg>;
    case "info":          return <svg {...props}><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5.2v.1"/></svg>;
    case "sparkles":      return <svg {...props}><path d="M9 2.5l1.1 2.4 2.4 1.1-2.4 1.1L9 9.5 7.9 7.1 5.5 6l2.4-1.1L9 2.5Z"/><path d="M4 10l.7 1.4 1.4.6-1.4.6L4 14l-.7-1.4L1.9 12l1.4-.6L4 10Z"/></svg>;
    case "database":      return <svg {...props}><ellipse cx="8" cy="3.5" rx="5" ry="1.5"/><path d="M3 3.5v3c0 .83 2.24 1.5 5 1.5s5-.67 5-1.5v-3"/><path d="M3 8.5v3c0 .83 2.24 1.5 5 1.5s5-.67 5-1.5v-3"/></svg>;
    case "rotate-ccw":    return <svg {...props}><path d="M3 3v4h4"/><path d="M3 7a6 6 0 1 1-.5 3"/></svg>;
  }
}
