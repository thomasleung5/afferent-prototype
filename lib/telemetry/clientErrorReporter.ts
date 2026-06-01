/* Client-side error reporting hook point.
 *
 * The default reporter writes to `console.warn` / `console.error`
 * exactly as the call sites used to do directly. The indirection
 * exists so a production deployment that wants durable client-error
 * collection (Sentry, Datadog Browser RUM, etc.) can replace the
 * reporter once at app boot:
 *
 *     // src/main.tsx (deployment-specific bootstrap)
 *     import { setClientErrorReporter } from "@/lib/telemetry/clientErrorReporter";
 *     setClientErrorReporter({
 *       report({ source, level, message, fields }) {
 *         Sentry.captureMessage(`[${source}] ${message}`, {
 *           level,
 *           tags: { source },
 *           extra: fields,
 *         });
 *       },
 *     });
 *
 * Call sites pass structured `{ source, level, message, fields }` —
 * keep `fields` free of payload bytes, auth headers, and full URLs
 * (which may carry recovery-token query strings). Endpoint paths,
 * HTTP status codes, error names, and message strings are fine.
 *
 * This is the BROWSER-side counterpart to the server's structured JSON
 * log stream (`server/logger.ts`). The two are independent — server
 * logs go to stdout and are scraped by the runtime; browser logs go
 * to dev tools (default) or whichever collector you wire in here. */

export type ClientErrorLevel = "warn" | "error";

export interface ClientErrorPayload {
  /** Logical source — `"errorBoundary"`, `"apiFetch"`, `"apiResponse"`,
   *  etc. Used as a tag/prefix by collectors. */
  source: string;
  level: ClientErrorLevel;
  message: string;
  /** Structured tags. Endpoint path, HTTP status, error name, component
   *  stack — never request bodies, auth tokens, or PII. */
  fields?: Record<string, string | number | undefined>;
}

export interface ClientErrorReporter {
  report(payload: ClientErrorPayload): void;
}

const consoleReporter: ClientErrorReporter = {
  report({ source, level, message, fields }) {
    // eslint-disable-next-line no-console
    const fn = level === "error" ? console.error : console.warn;
    fn(`[${source}] ${message}`, fields ?? {});
  },
};

let current: ClientErrorReporter = consoleReporter;

/** Replace the default console reporter. Call once at app start to
 *  wire Sentry/Datadog/etc. Subsequent calls overwrite the active
 *  reporter — last write wins. */
export function setClientErrorReporter(reporter: ClientErrorReporter): void {
  current = reporter;
}

/** Reset to the built-in console reporter. Used by tests; production
 *  code shouldn't need it. */
export function resetClientErrorReporter(): void {
  current = consoleReporter;
}

/** Report a client-side error / warning. Default backend logs to the
 *  browser console; replace via `setClientErrorReporter`. */
export function reportClientError(payload: ClientErrorPayload): void {
  current.report(payload);
}
