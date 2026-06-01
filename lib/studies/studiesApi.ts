/* Browser-side adapter for /api/studies/*.
 *
 * Mirrors the lib/ai/aiApi.ts pattern: reuse the Supabase access-token
 * header helper, log non-2xx / thrown fetch through the shared
 * `reportClientError` indirection, and normalize the response into a
 * discriminated `ApiResult<T>` so callers can switch on the
 * `ok` discriminator.
 *
 * UI-agnostic on purpose — no Zustand hooks, no React imports. The
 * SPA store hydration / save-on-debounce flow (when it lands) wires
 * these helpers in itself. */

import { aiAuthHeaders } from "@/lib/ai/aiApi";
import { reportClientError } from "@/lib/telemetry/clientErrorReporter";
import type { BuildSnapshot } from "@/lib/store";

// ====================================================================
// Row shapes (mirror server query SELECTs in server/studies/index.ts)
// ====================================================================

export interface Study {
  id: string;
  organization_id: string;
  name: string;
  fiscal_year: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface StudyDraft {
  /** BuildSnapshot, but typed loosely on the wire — the SPA migrates
   *  through `migratePersistedState` before passing into the store. */
  snapshot: unknown;
  updated_by: string;
  updated_at: string;
}

export interface StudyVersionRow {
  id: string;
  study_id: string;
  version_number: number;
  label: string;
  status: VersionStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export type VersionStatus =
  | "draft" | "review" | "published" | "adopted" | "archived";

// ====================================================================
// API result envelope
// ====================================================================

export type ApiResult<T> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

async function studiesFetch<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    ...(await aiAuthHeaders()),
  };
  if (init.body != null && !("Content-Type" in headers) && !("content-type" in headers)) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error.";
    reportClientError({
      source: "apiFetch",
      level: "error",
      message,
      fields: { path },
    });
    return { ok: false, message };
  }

  if (res.status >= 400) {
    reportClientError({
      source: "apiResponse",
      level: "warn",
      message: "non-2xx response",
      fields: { path, status: res.status },
    });
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await res.json()) as ApiResult<T>;
  }
  const text = await res.text().catch(() => "");
  return { ok: false, message: text || `HTTP ${res.status}` };
}

// ====================================================================
// Studies
// ====================================================================

export function listStudies(): Promise<ApiResult<{ studies: Study[] }>> {
  return studiesFetch("/api/studies");
}

export interface CreateStudyRequest {
  organizationId: string;
  name: string;
  fiscalYear?: string;
}

export function createStudy(input: CreateStudyRequest): Promise<ApiResult<{ study: Study }>> {
  return studiesFetch("/api/studies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getStudy(
  id: string,
): Promise<ApiResult<{ study: Study; draft: StudyDraft | null }>> {
  return studiesFetch(`/api/studies/${id}`);
}

// ====================================================================
// Drafts
// ====================================================================

export function saveStudySnapshot(
  id: string,
  snapshot: BuildSnapshot,
): Promise<ApiResult<Record<string, never>>> {
  return studiesFetch(`/api/studies/${id}/snapshot`, {
    method: "PUT",
    body: JSON.stringify({ snapshot }),
  });
}

// ====================================================================
// Versions
// ====================================================================

export function listStudyVersions(
  id: string,
): Promise<ApiResult<{ versions: StudyVersionRow[] }>> {
  return studiesFetch(`/api/studies/${id}/versions`);
}

export interface CreateStudyVersionRequest {
  label: string;
  status?: VersionStatus;
  notes?: string;
  /** Omit to cut a version from the study's current draft. */
  snapshot?: BuildSnapshot;
}

export function createStudyVersion(
  id: string,
  input: CreateStudyVersionRequest,
): Promise<ApiResult<{ version: StudyVersionRow }>> {
  return studiesFetch(`/api/studies/${id}/versions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
