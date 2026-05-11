
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Btn } from "./Btn";
import { Icon } from "./Icon";

export type ImportKind =
  | "budget"
  | "fee-schedule"
  | "workload"
  | "salary"
  | "operating"
  | "cap";

export interface ImportPreview {
  fileName: string;
  /** Row counts the user sees after a "parse." Pure mock — no real parsing. */
  rows: number;
  mapped: number;
  review: number;
  /** Human formats hint shown in the dropzone. */
  formats: string;
}

const PRESETS: Record<ImportKind, { label: string; defaultName: string; rows: number; mapped: number; review: number; formats: string; hint: string }> = {
  budget: {
    label: "Import budget",
    defaultName: "FY 26-27 Budget Book.pdf",
    rows: 22, mapped: 19, review: 3,
    formats: "xlsx, csv, budget book pdf",
    hint: "Drag the budget book or a department detail sheet. Common formats: Tyler / OpenGov budget extracts, line-item Excel, or scanned PDF.",
  },
  "fee-schedule": {
    label: "Import fee schedule",
    defaultName: "FY 24-25 Fee Study · Appendix A.xlsx",
    rows: 32, mapped: 30, review: 2,
    formats: "xlsx, csv, fee schedule pdf",
    hint: "Drag a current fee schedule or prior fee study workbook. Marked-up PDFs are OK.",
  },
  workload: {
    label: "Import workload data",
    defaultName: "Permits_FY26-27_Q1-Q4.csv",
    rows: 1246, mapped: 184, review: 17,
    formats: "xlsx, csv permit-system exports",
    hint: "Drag a permit-system export. Tyler EnerGov, Accela, OpenGov, or any CSV with service + volume columns.",
  },
  salary: {
    label: "Import salary data",
    defaultName: "FY 26-27 Salary Table.xlsx",
    rows: 73, mapped: 67, review: 6,
    formats: "xlsx, csv, pdf budget exports",
    hint: "Drag a salary table or position list. Tyler / OpenGov / Workday exports work, or a budget book PDF.",
  },
  operating: {
    label: "Import operating costs",
    defaultName: "FY 26-27 Budget Book.pdf · pp. 142–158",
    rows: 22, mapped: 19, review: 3,
    formats: "xlsx, csv, budget book pdf",
    hint: "Drag a budget book or department detail sheet with non-labor line items.",
  },
  cap: {
    label: "Import cost allocation plan",
    defaultName: "CAP Allocation Inventory.xlsx",
    rows: 15, mapped: 15, review: 1,
    formats: "xlsx, csv",
    hint: "Drag the most recent Cost Allocation Plan inventory. Centers, pools, and bases all in one workbook.",
  },
};

interface Props {
  kind: ImportKind;
  /** Called with the mock preview after the user confirms the import. */
  onConfirm?: (preview: ImportPreview) => void;
  /** Defaults to the preset label for `kind`. */
  label?: ReactNode;
  size?: "sm" | "md";
}

/** Two-step mock import flow: button opens a modal with a fake drop zone and
 *  a parsed-row preview. Confirm fires `onConfirm` so the screen can simulate
 *  the import effect. No real file parsing happens. */
export function ImportButton({ kind, onConfirm, label, size = "md" }: Props) {
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const preset = PRESETS[kind];

  useEffect(() => {
    if (!open) { setStaged(false); return; }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const stage = () => setStaged(true);

  const confirm = () => {
    onConfirm?.({
      fileName: preset.defaultName,
      rows: preset.rows,
      mapped: preset.mapped,
      review: preset.review,
      formats: preset.formats,
    });
    setOpen(false);
  };

  return (
    <>
      <Btn
        kind={size === "sm" ? "subtle" : "ghost"}
        onClick={() => setOpen(true)}
        style={size === "sm" ? { height: 26, padding: "0 9px", fontSize: 12 } : undefined}
      >
        <Icon name="download" size={13} style={{ transform: "rotate(180deg)" }}/>
        {label ?? preset.label}
      </Btn>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 90,
            background: "rgba(20,20,30,0.32)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520, maxWidth: "94vw",
              background: "var(--paper)",
              border: "1px solid var(--rule-strong)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.14)",
            }}
          >
            <div style={{
              padding: "14px 20px", borderBottom: "1px solid var(--rule)",
              background: "var(--paper-2)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div className="mono" style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
                  color: "var(--ink-3)", textTransform: "uppercase",
                }}>Mock import</div>
                <div className="display" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>
                  {preset.label}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  width: 28, height: 28,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid var(--rule)", background: "var(--paper)",
                  color: "var(--ink-2)", cursor: "pointer",
                }}
              >
                <Icon name="close" size={13}/>
              </button>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              {!staged ? (
                <>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
                    {preset.hint}
                  </div>
                  <button
                    onClick={() => fileInput.current?.click()}
                    style={{
                      padding: "26px 18px",
                      background: "var(--paper-2)",
                      border: "1px dashed var(--rule-strong)",
                      cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                      color: "var(--ink-2)",
                    }}
                  >
                    <Icon name="download" size={18}/>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Click to choose a file, or drag here</div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
                      {preset.formats}
                    </div>
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    onChange={stage}
                    style={{ display: "none" }}
                  />
                  <button
                    onClick={stage}
                    style={{
                      alignSelf: "flex-start",
                      fontSize: 12, color: "var(--accent)",
                      background: "transparent", border: "none",
                      cursor: "pointer", padding: 0,
                    }}
                  >
                    Or use the sample file →
                  </button>
                </>
              ) : (
                <>
                  <div style={{
                    padding: "12px 14px",
                    background: "var(--paper-2)", border: "1px solid var(--rule)",
                    display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginRight: 8 }}>FILE</span>
                      {preset.defaultName}
                    </div>
                    <div style={{
                      display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
                      marginTop: 6,
                    }}>
                      <ParseStat label="Rows" value={preset.rows}/>
                      <ParseStat label="Mapped" value={preset.mapped} tone="pos"/>
                      <ParseStat label="Need review" value={preset.review} tone={preset.review > 0 ? "warn" : "pos"}/>
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
                    Mock import — confirms a parsed snapshot back into the active screen.
                    No backend yet; refreshing the page resets to seed data.
                  </div>
                </>
              )}
            </div>

            <div style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--rule)",
              background: "var(--paper-2)",
              display: "flex", justifyContent: "flex-end", gap: 8,
            }}>
              <Btn kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
              <Btn kind="primary" onClick={confirm} disabled={!staged}>
                <Icon name="check" size={13}/> Apply import
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ParseStat({ label, value, tone }: { label: string; value: number; tone?: "pos" | "warn" }) {
  const color = tone === "pos" ? "var(--pos)" : tone === "warn" ? "var(--warn)" : "var(--ink)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div className="mono" style={{
        fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div className="num" style={{ fontSize: 16, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}
