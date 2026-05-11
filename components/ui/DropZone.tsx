"use client";

import { useRef, useState, type ReactNode } from "react";
import { Btn } from "./Btn";
import { Icon } from "./Icon";

export interface LastImport {
  file: string;
  rows: number;
  mapped: number;
  review: number;
  date: string;
}

interface Props {
  accept?: string;
  formats?: string;
  hint?: ReactNode;
  lastImport?: LastImport;
  /** Receives the dropped File and runs the per-tab extractor. Returns a
   *  result the DropZone uses to update its own "last import" panel. */
  onImport?: (file: File) => Promise<LastImport>;
}

type Stage = "idle" | "parsing" | "mapping" | "done";

/** Top-of-page drop surface for input screens. Accepts file drop or browse;
 *  parses → maps → done. Right pane shows the last-imported file's provenance
 *  — rows, mapped, need-review, date. Unchanged Claude Design chrome. */
export function DropZone({ accept, formats, hint, lastImport, onImport }: Props) {
  const [over, setOver] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [latest, setLatest] = useState<LastImport | undefined>(lastImport);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (file: File) => {
    setStage("parsing");
    try {
      const result = await onImport?.(file);
      setStage("mapping");
      await new Promise((r) => setTimeout(r, 250));
      setStage("done");
      if (result) setLatest(result);
    } catch (err) {
      setStage("idle");
      console.error("import failed:", err);
    }
  };

  const display = latest ?? lastImport;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) void run(f);
      }}
      style={{
        background: stage === "idle" ? "var(--paper)" : "var(--paper-2)",
        border: `1px ${stage === "idle" ? "dashed" : "solid"} ${over ? "var(--accent)" : "var(--rule-strong)"}`,
        display: "grid", gridTemplateColumns: "1.2fr 1fr",
      }}
    >
      <div style={{ padding: "22px 26px", borderRight: "1px solid var(--rule)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, flexShrink: 0,
            border: "1px solid var(--rule-strong)",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--paper)",
          }}>
            <Icon name="download" size={18} style={{ transform: "rotate(180deg)" }}/>
          </div>
          <div>
            <div className="display" style={{ fontSize: 16, fontWeight: 600 }}>
              {stage === "idle"    && "Drop file to import"}
              {stage === "parsing" && "Parsing source…"}
              {stage === "mapping" && "Auto-mapping rows…"}
              {stage === "done"    && "Import complete"}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
              {stage === "idle"
                ? (hint ?? `Drag and drop, paste, or click to browse. Accepts ${formats ?? "xlsx, csv, pdf"}.`)
                : display ? `${display.file} · ${display.rows} rows` : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <Btn kind="primary" onClick={() => fileRef.current?.click()}>
            <Icon name="plus" size={13}/> Browse files
          </Btn>
          <Btn kind="ghost">Paste from clipboard</Btn>
          <Btn kind="ghost">Connect data source</Btn>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); }}
          />
        </div>
        {(stage === "parsing" || stage === "mapping") && (
          <div style={{ marginTop: 14, height: 4, background: "var(--paper-3)" }}>
            <div style={{
              height: "100%",
              width: stage === "parsing" ? "35%" : "75%",
              background: "var(--accent)",
              transition: "width 600ms",
            }}/>
          </div>
        )}
      </div>
      <div style={{
        padding: "22px 26px",
        display: "flex", flexDirection: "column", gap: 10,
        fontSize: 12, color: "var(--ink-2)",
      }}>
        <div className="mono" style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Last import</div>
        {display ? (
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, fontSize: 12 }}>
            <span style={{ color: "var(--ink-3)" }}>File</span>
            <span className="mono" style={{
              color: "var(--ink)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={display.file}>{display.file}</span>

            <span style={{ color: "var(--ink-3)" }}>Imported</span>
            <span className="num">{display.rows}</span>

            <span style={{ color: "var(--ink-3)" }}>Auto-mapped</span>
            <span className="num" style={{ color: "var(--pos)" }}>{display.mapped}</span>

            <span style={{ color: "var(--ink-3)" }}>Need review</span>
            <span className="num" style={{ color: display.review > 0 ? "var(--warn)" : "var(--ink-2)" }}>
              {display.review}
            </span>

            <span style={{ color: "var(--ink-3)" }}>Date</span>
            <span className="mono">{display.date}</span>
          </div>
        ) : (
          <span style={{ color: "var(--ink-4)" }}>No file imported yet — manual entry only.</span>
        )}
      </div>
    </div>
  );
}
