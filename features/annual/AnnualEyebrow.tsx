interface Props {
  label: string;
}

export function AnnualEyebrow({ label }: Props) {
  return (
    <span>
      Annual Update
      <span style={{ color: "var(--ink-4)", margin: "0 7px" }}>·</span>
      {label}
    </span>
  );
}
