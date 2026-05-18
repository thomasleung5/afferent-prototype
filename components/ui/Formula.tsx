import type { ReactNode } from "react";
import type { SourceTag } from "@/lib/types";

interface Props {
  children: ReactNode;
}

/** Inline mono chip for showing a computation snippet. */
export function Formula({ children }: Props) {
  return (
    <span className="mono" style={{
      fontSize: 11.5, color: "var(--ink-2)",
      background: "var(--paper)",
      padding: "2px 6px",
      border: "1px solid var(--rule)",
    }}>{children}</span>
  );
}

type PillTone = "default" | "cap" | "salary" | "fact" | "policy";

interface SourcePillProps {
  children?: ReactNode;
  tone?: PillTone;
  /** When provided, the pill renders from the SourceTag (label + tone
   *  resolved per the standard table). `children` overrides this if both
   *  are given — kept for legacy inline callers. */
  source?: SourceTag;
  /** Filename to display when source === "imported". Truncated in the
   *  cell; full filename appears in `title=` tooltip. */
  sourceFile?: string;
}

const SOURCE_TONE: Record<SourceTag, PillTone> = {
  seed: "default",
  imported: "fact",
  manual: "policy",
  "carry-forward": "default",
  missing: "default",
};

const SOURCE_LABEL: Record<SourceTag, string> = {
  seed: "Seed data",
  imported: "Imported",
  manual: "Manual entry",
  "carry-forward": "Carry-forward",
  missing: "Missing",
};

const FILENAME_TRUNCATE = 32;

function shortFilename(name: string): string {
  if (name.length <= FILENAME_TRUNCATE) return name;
  // Keep the extension if present so `.pdf` / `.xlsx` is visible.
  const dot = name.lastIndexOf(".");
  if (dot > 0 && name.length - dot <= 6) {
    const ext = name.slice(dot);
    const head = name.slice(0, FILENAME_TRUNCATE - ext.length - 1);
    return `${head}…${ext}`;
  }
  return `${name.slice(0, FILENAME_TRUNCATE - 1)}…`;
}

/** Small mono pill used inline for source attribution. Two modes:
 *  - `<SourcePill source={s.source} sourceFile={s.sourceFile} />` for the
 *    standardized row-level Source column (recommended).
 *  - `<SourcePill tone="cap">Custom</SourcePill>` for inline non-row labels. */
export function SourcePill({ children, tone, source, sourceFile }: SourcePillProps) {
  const resolvedTone: PillTone = tone ?? (source ? SOURCE_TONE[source] : "default");
  const palette: Record<PillTone, { bg: string; fg: string; bd: string }> = {
    default: { bg: "var(--paper-2)", fg: "var(--ink-3)", bd: "var(--rule)" },
    cap:     { bg: "var(--paper-2)", fg: "var(--accent)", bd: "var(--rule)" },
    salary:  { bg: "var(--paper-2)", fg: "var(--ink-2)", bd: "var(--rule)" },
    fact:    { bg: "var(--paper-2)", fg: "var(--ink-3)", bd: "var(--rule)" },
    policy:  { bg: "var(--accent-tint)", fg: "var(--accent)", bd: "var(--accent)" },
  };
  const p = palette[resolvedTone];

  // Resolve the displayed label + full tooltip text when source is provided
  // and children isn't an override.
  let content: ReactNode = children;
  let titleAttr: string | undefined;
  if (children == null && source) {
    if (source === "imported" && sourceFile) {
      content = shortFilename(sourceFile);
      if (sourceFile.length > FILENAME_TRUNCATE) titleAttr = sourceFile;
    } else {
      content = SOURCE_LABEL[source];
    }
  }

  return (
    <span className="mono" title={titleAttr} style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 6px",
      fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
      color: p.fg, background: p.bg, border: `1px solid ${p.bd}`,
      whiteSpace: "nowrap", maxWidth: "100%",
      overflow: "hidden", textOverflow: "ellipsis",
    }}>{content}</span>
  );
}

