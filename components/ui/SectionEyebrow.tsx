interface Props {
  prefix: string;
  label: string;
}

/** Page eyebrow that reads as a system component. Renders "prefix · label". */
export function SectionEyebrow({ prefix, label }: Props) {
  return (
    <span>
      {prefix}
      <span style={{ color: "var(--ink-4)", margin: "0 7px" }}>·</span>
      {label}
    </span>
  );
}
