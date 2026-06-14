import { useMemo } from "react";
import { DataTable, type Column } from "@/components/table";
import { SectionLabel } from "@/components/ui";
import { useBuildState, type Domain } from "@/lib/store";

const DOMAIN_LABEL: Record<Domain, string> = {
  positions: "Labor",
  operating: "Operating Costs",
  services: "Services",
  fees: "Fee Schedule",
  volume: "Volume of Activity",
  cap: "Overhead Costs",
};

interface ImportRow {
  id: string;
  /** ISO string — kept as the sort key so newest-first ordering is stable. */
  at: string;
  domain: Domain;
  fileName: string;
  mapped: number;
  review: number;
  unmapped: number;
  dups: number;
}

function formatImportedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/** Recent imports feed on the Home screen. Reads the store's `imports` log
 *  (appended by each merge*) and renders newest-first via the shared
 *  DataTable so header/row styling matches every other table in the app. */
export function AuditTrail() {
  const { imports } = useBuildState();

  const rows: ImportRow[] = useMemo(() => imports.map((e) => ({
    id: String(e.id),
    at: e.at,
    domain: e.domain,
    fileName: e.result.fileName,
    mapped: e.result.mapped,
    review: e.result.lowConfidence,
    unmapped: e.result.unmapped,
    dups: e.result.duplicates,
  })), [imports]);

  const cols: Column<ImportRow>[] = [
    {
      key: "at",
      label: "Imported",
      width: "180px",
      sortable: true,
      render: (r) => formatImportedAt(r.at),
    },
    {
      key: "domain",
      label: "Domain",
      width: "150px",
      sortable: true,
      sortKey: (r) => DOMAIN_LABEL[r.domain] ?? r.domain,
      render: (r) => DOMAIN_LABEL[r.domain] ?? r.domain,
    },
    {
      key: "fileName",
      label: "File",
      width: "minmax(220px, 1fr)",
      sortable: true,
      render: (r) => (
        <span
          title={r.fileName}
          style={{
            display: "block",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {r.fileName}
        </span>
      ),
    },
    {
      key: "mapped",
      label: "Mapped",
      width: "80px",
      align: "right",
      sortable: true,
      render: (r) => <CountCell value={r.mapped}/>,
    },
    {
      key: "review",
      label: "Review",
      width: "80px",
      align: "right",
      sortable: true,
      render: (r) => <CountCell value={r.review}/>,
    },
    {
      key: "unmapped",
      label: "Unmapped",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => <CountCell value={r.unmapped}/>,
    },
    {
      key: "dups",
      label: "Dups",
      width: "70px",
      align: "right",
      sortable: true,
      render: (r) => <CountCell value={r.dups}/>,
    },
  ];

  return (
    <div>
      <SectionLabel right={`${rows.length} import${rows.length === 1 ? "" : "s"}`}>
        Recent imports
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={rows}
        defaultSort={{ key: "at", dir: "desc" }}
        emptyState="Imports will appear here after you upload source files (PDFs or pasted LLM JSON) from any Build page."
      />
    </div>
  );
}

function CountCell({ value }: { value: number }) {
  return (
    <span
      className="num"
      style={{ color: value > 0 ? "var(--ink)" : "var(--ink-4)" }}
    >
      {value}
    </span>
  );
}
