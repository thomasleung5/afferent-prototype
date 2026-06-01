/* Minimal structured logger for the AI parse routes.
 *
 * Writes one JSON object per line to stdout. Compatible with every
 * log-collector we'd realistically pipe this into (Datadog, Loki,
 * Cloud Logging, fluent-bit). No dependency on pino/winston — for
 * the surface area we have, a 20-line emitter is enough and avoids
 * pulling in a transitive tree.
 *
 * Fields the SRE team will care about, in order of importance:
 *   - ts:         ISO8601 timestamp, sortable
 *   - level:      "info" | "warn" | "error"
 *   - msg:        short message (free-form, low-cardinality preferred)
 *   - route:      request path when known
 *   - status:     HTTP status when known
 *   - latency_ms: request lifecycle latency (set by requestLogger)
 *   - tag:        per-domain log tag (set by parsers, e.g. "ai-parse-fees")
 *   - …extras:    any other fields passed in the args object
 *
 * Designed to be safe to call from any module without setup. Tests
 * can override LOG_SINK to capture output deterministically. */

export type LogLevel = "info" | "warn" | "error";

export interface LogFields {
  level?: LogLevel;
  msg: string;
  method?: string;
  route?: string;
  status?: number;
  latency_ms?: number;
  tag?: string;
  req_id?: string;
  [key: string]: unknown;
}

/** Sink that receives each formatted JSON line. Defaults to stdout;
 *  tests swap it via `setLogSink` to capture output. */
type Sink = (line: string) => void;

let sink: Sink = (line) => process.stdout.write(line + "\n");

export function setLogSink(next: Sink): void {
  sink = next;
}

export function resetLogSink(): void {
  sink = (line) => process.stdout.write(line + "\n");
}

/** Emit a structured log line. The `level` defaults to "info" if not
 *  provided; `ts` is always set to the current timestamp. */
export function logEvent(fields: LogFields): void {
  const { level = "info", ...rest } = fields;
  const payload = {
    ts: new Date().toISOString(),
    level,
    ...rest,
  };
  try {
    sink(JSON.stringify(payload));
  } catch {
    // Sink failure shouldn't crash the request. Swallow.
  }
}
