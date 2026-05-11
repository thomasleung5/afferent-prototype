interface Props {
  role: string;
  label: string;
}

export function AnnualEyebrow({ role, label }: Props) {
  return (
    <span>
      Annual Update
      <span style={{ color: "var(--ink-4)", margin: "0 7px" }}>·</span>
      {role}
      <span style={{ color: "var(--ink-4)", margin: "0 7px" }}>·</span>
      {label}
    </span>
  );
}
