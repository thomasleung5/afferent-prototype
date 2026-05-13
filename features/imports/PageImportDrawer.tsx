import { useRef, useState, type ReactNode } from "react";
import { Btn, Drawer, Icon } from "@/components/ui";
import { MappingReview } from "@/features/imports/MappingReview";
import { useBuildState } from "@/lib/store";
import { runImportPipeline } from "@/lib/import/pipeline";
import type { DocumentType } from "@/lib/import/types";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  helper?: ReactNode;
  accept?: string;
  formats?: string;
  schema?: ReactNode;
  forceType?: DocumentType;
}

type Stage = "idle" | "parsing" | "mapping" | "done";

export function PageImportDrawer({
  open, onClose,
  title, helper,
  accept = ".xlsx,.csv,.pdf",
  formats = "xlsx, csv, pdf",
  schema,
  forceType,
}: Props) {
  const { services, currentBatch, setCurrentBatch, applyCurrentBatch } = useBuildState();
  const [over, setOver] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [latest, setLatest] = useState<{ file: string; rows: number; date: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (file: File) => {
    setStage("parsing");
    try {
      const batch = await runImportPipeline(file, { services, forceType });
      setCurrentBatch(batch);
      setStage("mapping");
      await new Promise((r) => setTimeout(r, 200));
      setStage("done");
      setLatest({
        file: file.name,
        rows: batch.mappings.length,
        date: new Date().toLocaleString(undefined, {
          month: "short", day: "numeric", year: "numeric",
          hour: "numeric", minute: "2-digit",
        }),
      });
    } catch (err) {
      setStage("idle");
      console.error("import failed:", err);
    }
  };

  const handleClose = () => {
    setStage("idle");
    setOver(false);
    onClose();
  };

  const handleCancel = () => {
    setCurrentBatch(null);
    setLatest(null);
    handleClose();
  };

  const handleContinue = () => {
    if (currentBatch) applyCurrentBatch();
    setLatest(null);
    handleClose();
  };

  const accepted = currentBatch?.mappings.filter((m) => m.status === "auto_accepted").length ?? 0;
  const review = currentBatch
    ? currentBatch.mappings.filter((m) => m.status === "needs_review" || m.status === "unresolved").length
    : 0;
  const ready = !!currentBatch && stage === "done";

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title={title}
      subtitle={helper}
      width={640}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
            padding: "18px 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 34, height: 34, flexShrink: 0,
              border: "1px solid var(--rule-strong)",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--paper)",
            }}>
              <Icon name="download" size={16} style={{ transform: "rotate(180deg)" }}/>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="display" style={{ fontSize: 14, fontWeight: 600 }}>
                {stage === "idle"    && "Drop file to import"}
                {stage === "parsing" && "Parsing source…"}
                {stage === "mapping" && "Auto-mapping rows…"}
                {stage === "done"    && "Import complete"}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                {stage === "idle"
                  ? `Drag and drop, paste, or click to browse. Accepts ${formats}.`
                  : latest ? `${latest.file} · ${latest.rows} rows` : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
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

        {!currentBatch && (
          <div style={{
            border: "1px solid var(--rule)", background: "var(--paper)",
            padding: "14px 16px",
            display: "grid", gridTemplateColumns: "120px 1fr", gap: "10px 14px",
            fontSize: 12, lineHeight: 1.5,
          }}>
            <div className="mono" style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
              color: "var(--ink-3)", textTransform: "uppercase", paddingTop: 2,
            }}>Accepts</div>
            <div style={{ color: "var(--ink-2)" }}>{formats}</div>
            {schema && (
              <>
                <div className="mono" style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
                  color: "var(--ink-3)", textTransform: "uppercase", paddingTop: 2,
                }}>Schema</div>
                <div style={{ color: "var(--ink-2)" }}>{schema}</div>
              </>
            )}
            {latest && (
              <>
                <div className="mono" style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
                  color: "var(--ink-3)", textTransform: "uppercase", paddingTop: 2,
                }}>Last import</div>
                <div className="mono" style={{ color: "var(--ink)" }}>
                  {latest.file} · {latest.date}
                </div>
              </>
            )}
          </div>
        )}

        {ready && (
          <div style={{
            border: "1px solid var(--rule)", background: "var(--paper)",
            padding: "12px 16px",
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14,
            fontSize: 12,
          }}>
            <Stat label="Rows" value={currentBatch.mappings.length} color="var(--ink)"/>
            <Stat label="Auto-mapped" value={accepted} color="var(--pos)"/>
            <Stat label="Need review" value={review} color={review > 0 ? "var(--warn)" : "var(--ink-2)"}/>
          </div>
        )}

        {ready && <MappingReview/>}
      </div>

      <div style={{
        position: "sticky", bottom: 0,
        marginTop: 18,
        padding: "12px 0",
        borderTop: "1px solid var(--rule)",
        background: "var(--paper)",
        display: "flex", justifyContent: "flex-end", gap: 8,
      }}>
        <Btn kind="ghost" onClick={handleCancel}>Cancel</Btn>
        <Btn kind="primary" onClick={handleContinue} disabled={!currentBatch}>
          {currentBatch ? "Apply import" : "Continue"}
        </Btn>
      </div>
    </Drawer>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div className="num" style={{
        fontSize: 17, fontWeight: 600, marginTop: 3, color,
      }}>{value}</div>
    </div>
  );
}
