
import { useEffect, useRef, useState } from "react";
import { Btn } from "./Btn";
import { Icon } from "./Icon";

interface Props {
  /** Async — generates the Excel Blob and triggers download. */
  onDownloadExcel: () => Promise<void>;
  /** URL of the print-route page. Rendered as an anchor with target="_blank"
   *  so the browser treats it as a user-initiated link and doesn't apply
   *  pop-up blocker heuristics (which would silently swallow a programmatic
   *  window.open call). */
  pdfHref: string;
  /** When true, shows a spinning indicator on the Export button. */
  busy?: boolean;
  label?: string;
  /** Optional dropdown item labels — defaults to fee-study copy. */
  pdfLabel?: string;
  pdfSub?: string;
  excelLabel?: string;
  excelSub?: string;
}

/** Dropdown menu attached to the Export button. Two items: PDF (print-friendly
 *  route) and Excel (xlsx workbook). Closes on outside click + ESC. */
export function ExportMenu({
  onDownloadExcel, pdfHref, busy = false, label = "Export",
  pdfLabel = "Fee study report (PDF)",
  pdfSub = "Council-ready, print-formatted",
  excelLabel = "Excel workbook (.xlsx)",
  excelSub = "9 sheets, with formulas as values",
}: Props) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleExcel = async () => {
    setOpen(false);
    setWorking(true);
    try { await onDownloadExcel(); }
    finally { setWorking(false); }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <Btn
        kind="ghost"
        onClick={() => setOpen((o) => !o)}
        disabled={busy || working}
        aria-expanded={open}
      >
        <Icon name="download" size={13}/>
        {working ? "Generating…" : label}
        <span style={{ marginLeft: 4, fontSize: 9, color: "var(--ink-3)" }}>▾</span>
      </Btn>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 30,
          width: 240,
          background: "var(--paper)",
          border: "1px solid var(--rule-strong)",
          boxShadow: "0 10px 24px rgba(15,23,42,0.10)",
        }}>
          <PdfMenuItem
            label={pdfLabel}
            sub={pdfSub}
            href={pdfHref}
            onSelect={() => setOpen(false)}
          />
          <MenuItem
            label={excelLabel}
            sub={excelSub}
            onClick={handleExcel}
            divider
          />
        </div>
      )}
    </div>
  );
}

const ITEM_STYLE = {
  display: "flex", flexDirection: "column" as const, gap: 2,
  width: "100%", textAlign: "left" as const,
  padding: "10px 14px",
  background: "transparent",
  cursor: "pointer",
  textDecoration: "none",
  color: "inherit",
};

function PdfMenuItem({
  label, sub, href, onSelect,
}: { label: string; sub: string; href: string; onSelect: () => void }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onSelect}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{ ...ITEM_STYLE, border: "none" }}
    >
      <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{sub}</span>
    </a>
  );
}

function MenuItem({
  label, sub, onClick, divider,
}: { label: string; sub: string; onClick: () => void; divider?: boolean }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{
        ...ITEM_STYLE,
        border: "none",
        borderTop: divider ? "1px solid var(--rule)" : "none",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{sub}</span>
    </button>
  );
}
