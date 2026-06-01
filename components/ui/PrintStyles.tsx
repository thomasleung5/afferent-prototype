import type { ReactNode } from "react";

interface Props {
  /** @page margin (any CSS length). Default "0.6in" matches the
   *  monitoring / fee-benchmarks / overhead routes. Fee Study can
   *  override to "0.7in" if its larger headline warrants more white. */
  pageMargin?: string;
  /** Optional per-route CSS appended after the canonical rules. Use for
   *  one-off classes specific to a single report (e.g. CAP's
   *  `.section-label`, fee-study's 30px title override). Pass a raw CSS
   *  string fragment. */
  extraCss?: ReactNode;
}

/** Canonical print stylesheet shared by every /export print-preview
 *  route. Consolidates the ~150-line @page + @media print + .report
 *  block that was hand-rolled in each export file. Per-route variants
 *  go through `pageMargin` and `extraCss`. */
export function PrintStyles({ pageMargin = "0.6in", extraCss }: Props) {
  return (
    <style>{`
      @page { size: letter; margin: ${pageMargin}; }
      html, body { color-scheme: light only; forced-color-adjust: none; }
      @media print {
        html, body {
          background: white !important;
          color: #1d2236 !important;
          color-scheme: light only !important;
          forced-color-adjust: none !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          margin: 0 !important;
          padding: 0 !important;
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
        }
        #root { height: auto !important; overflow: visible !important; }
        .no-print {
          display: none !important;
          visibility: hidden !important;
          position: static !important;
          height: 0 !important;
          width: 0 !important;
          overflow: hidden !important;
        }
        .report, .report * {
          color: #1d2236 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .report {
          display: block !important;
          width: auto !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          font-family: "IBM Plex Sans", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif !important;
        }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        .section-break { break-before: page; page-break-before: always; }
        .section-break:first-child { break-before: avoid; page-break-before: avoid; }
        .row { break-inside: avoid; page-break-inside: avoid; }
        table { break-inside: auto; page-break-inside: auto; }
      }
      .report {
        max-width: 7.4in;
        margin: 0 auto;
        background: white;
        padding: 32px 32px 48px;
        color: var(--ink);
        font-family: var(--ff-ui), "IBM Plex Sans", system-ui, sans-serif;
      }
      .report h1, .report h2, .report h3 { letter-spacing: -0.01em; }
      .report .eyebrow {
        font-family: var(--ff-mono);
        font-size: 10px; font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ink-3);
      }
      .report .title { font-size: 24px; font-weight: 600; line-height: 1.15; }
      .report .h2 { font-size: 16px; font-weight: 600; margin: 0 0 10px; }
      .report .h3 { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
      .report .body { font-size: 12.5px; color: var(--ink-2); line-height: 1.55; }
      .report .body p { margin: 0 0 10px; }
      .report .body p:last-child { margin-bottom: 0; }
      .report .body ul { margin: 6px 0 10px; padding-left: 20px; }
      .report .body li { margin-bottom: 4px; }
      .report .body-lede { max-width: 640px; }
      .report .footnote {
        margin-top: 14px;
        padding-top: 10px;
        border-top: 1px dashed var(--rule);
        font-size: 11.5px;
        color: var(--ink-3);
      }
      .report table { width: 100%; border-collapse: collapse; font-size: 11px; }
      .report th, .report td { padding: 6px 8px; text-align: left; vertical-align: top; }
      .report th {
        font-family: var(--ff-mono);
        font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em;
        text-transform: uppercase; color: var(--ink-3);
        border-bottom: 1px solid var(--rule-strong);
        background: var(--paper-2);
      }
      .report td { border-bottom: 1px solid var(--rule); }
      .report td.num, .report th.num { text-align: right; font-variant-numeric: tabular-nums; }
      .report .total td {
        border-top: 1.5px solid var(--ink);
        border-bottom: none;
        background: var(--paper-2);
        font-weight: 600;
      }
      .report .mono { font-family: var(--ff-mono); }
      .report .dim { color: var(--ink-4); }
      ${extraCss ?? ""}
    `}</style>
  );
}
