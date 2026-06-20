/* Request-body validators for /api/studies/*.
 *
 * All validators return a discriminated `ValidationResult<T>` so the
 * handler can branch on the discriminator and never has to test for
 * `undefined` on the validated value. Pure functions — no DB access,
 * no env reads — so fixture tests drive them directly.
 *
 * Snapshot validation is intentionally shallow. The persisted shape
 * (BuildSnapshot in lib/store.ts) is large, evolving, and migrated
 * by lib/storeMigration.ts at rehydrate time. Doing a deep validation
 * here would couple the database layer to the snapshot schema in a
 * way that creates a constant maintenance tax for no security
 * benefit. We confirm the payload is a JSON object that looks like a
 * snapshot (carries at least one of a small set of canonical fields)
 * and reject everything else. */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

const MAX_NAME = 200;
const MAX_LABEL = 200;
const MAX_FY = 50;
const MAX_JURISDICTION_ID = 100;
const MAX_NOTES = 10_000;

/** Match the UUID v4 shape Supabase uses. Case-insensitive. */
export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ====================================================================
// POST /api/studies
// ====================================================================

export interface CreateStudyInput {
  organizationId: string;
  name: string;
  fiscalYear?: string;
  jurisdictionId?: string;
}

export function validateCreateStudy(body: unknown): ValidationResult<CreateStudyInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Body must be a JSON object." };
  }
  const o = body as Record<string, unknown>;

  if (typeof o.organizationId !== "string" || !isUuid(o.organizationId)) {
    return { ok: false, message: "organizationId must be a UUID." };
  }

  if (typeof o.name !== "string") {
    return { ok: false, message: "name is required." };
  }
  const trimmedName = o.name.trim();
  if (trimmedName.length === 0) {
    return { ok: false, message: "name must not be blank." };
  }
  if (trimmedName.length > MAX_NAME) {
    return { ok: false, message: `name must be ≤ ${MAX_NAME} characters.` };
  }

  let fiscalYear: string | undefined;
  if (o.fiscalYear != null) {
    if (typeof o.fiscalYear !== "string") {
      return { ok: false, message: "fiscalYear must be a string when set." };
    }
    const trimmedFy = o.fiscalYear.trim();
    if (trimmedFy.length > MAX_FY) {
      return { ok: false, message: `fiscalYear must be ≤ ${MAX_FY} characters.` };
    }
    fiscalYear = trimmedFy.length > 0 ? trimmedFy : undefined;
  }

  let jurisdictionId: string | undefined;
  if (o.jurisdictionId != null) {
    if (typeof o.jurisdictionId !== "string") {
      return { ok: false, message: "jurisdictionId must be a string when set." };
    }
    const trimmedJurisdictionId = o.jurisdictionId.trim();
    if (trimmedJurisdictionId.length > MAX_JURISDICTION_ID) {
      return { ok: false, message: `jurisdictionId must be ≤ ${MAX_JURISDICTION_ID} characters.` };
    }
    jurisdictionId = trimmedJurisdictionId.length > 0 ? trimmedJurisdictionId : undefined;
  }

  return {
    ok: true,
    value: {
      organizationId: o.organizationId,
      name: trimmedName,
      fiscalYear,
      jurisdictionId,
    },
  };
}

// ====================================================================
// Snapshot payload (used by PUT /:id/snapshot and POST /:id/versions
// when the caller supplies an explicit snapshot)
// ====================================================================

/** Canonical fields present on every BuildSnapshot. We require at
 *  least one to be present — full schema validation lives in the
 *  application layer and would otherwise have to be revised every
 *  time lib/store.ts grows a new field. */
const SNAPSHOT_CANONICAL_FIELDS = [
  "services",
  "operating",
  "studyContext",
  "productiveHours",
  "activeFiscalYear",
] as const;

export interface SnapshotPayloadInput {
  snapshot: Record<string, unknown>;
  /** Optimistic-lock guard — when present, the snapshot handler will
   *  reject the save with 409 if the current draft's revision_id has
   *  drifted from this value. Omit for the first-ever save against a
   *  study (no row to lock against) or when the client deliberately
   *  wants last-writer-wins semantics. */
  expectedRevisionId?: string;
}

export function validateSnapshotPayload(body: unknown): ValidationResult<SnapshotPayloadInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Body must be a JSON object." };
  }
  const o = body as Record<string, unknown>;

  const snap = validateSnapshotField(o.snapshot);
  if (!snap.ok) return snap;

  let expectedRevisionId: string | undefined;
  if (o.expected_revision_id != null) {
    if (typeof o.expected_revision_id !== "string" || !isUuid(o.expected_revision_id)) {
      return { ok: false, message: "expected_revision_id must be a UUID when set." };
    }
    expectedRevisionId = o.expected_revision_id;
  }

  return {
    ok: true,
    value: { snapshot: snap.value.snapshot, expectedRevisionId },
  };
}

/** Shared snapshot field check, used by both the standalone payload
 *  validator and the version validator (which embeds an optional
 *  snapshot). */
export function validateSnapshotField(snap: unknown): ValidationResult<SnapshotPayloadInput> {
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) {
    return { ok: false, message: "snapshot must be an object." };
  }
  const s = snap as Record<string, unknown>;
  const hasAny = SNAPSHOT_CANONICAL_FIELDS.some((k) => k in s);
  if (!hasAny) {
    return {
      ok: false,
      message: "snapshot does not look like a BuildSnapshot — none of the expected top-level fields are present.",
    };
  }
  return { ok: true, value: { snapshot: s } };
}

// ====================================================================
// POST /api/studies/:id/versions
// ====================================================================

export type VersionStatus = "draft" | "review" | "published" | "adopted" | "archived";

const VALID_STATUSES: VersionStatus[] = [
  "draft", "review", "published", "adopted", "archived",
];

export interface CreateVersionInput {
  label: string;
  status: VersionStatus;
  notes?: string;
  /** When undefined, the handler cuts from the current draft. */
  snapshot?: Record<string, unknown>;
}

export function validateCreateVersion(body: unknown): ValidationResult<CreateVersionInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Body must be a JSON object." };
  }
  const o = body as Record<string, unknown>;

  if (typeof o.label !== "string") {
    return { ok: false, message: "label is required." };
  }
  const trimmedLabel = o.label.trim();
  if (trimmedLabel.length === 0) {
    return { ok: false, message: "label must not be blank." };
  }
  if (trimmedLabel.length > MAX_LABEL) {
    return { ok: false, message: `label must be ≤ ${MAX_LABEL} characters.` };
  }

  let status: VersionStatus = "draft";
  if (o.status != null) {
    if (typeof o.status !== "string" || !(VALID_STATUSES as string[]).includes(o.status)) {
      return {
        ok: false,
        message: `status must be one of: ${VALID_STATUSES.join(", ")}.`,
      };
    }
    status = o.status as VersionStatus;
  }

  let notes: string | undefined;
  if (o.notes != null) {
    if (typeof o.notes !== "string") {
      return { ok: false, message: "notes must be a string when set." };
    }
    if (o.notes.length > MAX_NOTES) {
      return { ok: false, message: `notes must be ≤ ${MAX_NOTES} characters.` };
    }
    notes = o.notes;
  }

  let snapshot: Record<string, unknown> | undefined;
  if (o.snapshot !== undefined) {
    const r = validateSnapshotField(o.snapshot);
    if (!r.ok) return r;
    snapshot = r.value.snapshot;
  }

  return {
    ok: true,
    value: { label: trimmedLabel, status, notes, snapshot },
  };
}
