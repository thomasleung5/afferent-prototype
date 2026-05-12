/* Zod schemas for AI-extracted entities, one per domain. The server validates
 * tool output against these before returning suggestions; the client store
 * trusts the validated shape and only does light type-narrowing on accept.
 *
 * Keep these aligned with lib/types.ts. Anything the AI returns that isn't
 * in the schema is stripped via .strip() (the default), and missing required
 * fields cause the suggestion to be dropped with a validation reason. */

import { z } from "zod";

const dept = z.enum(["PLAN", "BLDG", "ENG"]);

const opDept = z.union([dept, z.literal("SHARED:CDS")]);

const opCategory = z.enum([
  "Software & subscriptions",
  "Professional services",
  "Training & travel",
  "Office & supplies",
  "Memberships & dues",
  "Vehicles & equipment",
  "Legal noticing",
  "Capital outlay",
  "Other",
]);

const confidence = z.enum(["high", "med", "low"]);

/** Per-domain entity shapes. Numbers are coerced from strings since the AI
 *  sometimes returns "1720" instead of 1720. */
const num = z.coerce.number();
const nonEmpty = z.string().trim().min(1);

export const positionSchema = z.object({
  title: nonEmpty,
  dept,
  fte: num.optional().default(1),
  salary: num.optional().default(0),
  benefits: num.optional().default(0),
  hours: num.optional().default(1720),
});

export const operatingSchema = z.object({
  code: z.string().optional().default(""),
  line: nonEmpty,
  dept: opDept,
  category: opCategory,
  amount: num.optional().default(0),
  include: z.boolean().optional().default(true),
});

export const serviceSchema = z.object({
  name: nonEmpty,
  dept,
  hours: num.optional().default(0),
  volume: num.optional().default(0),
  fee: num.optional().default(0),
  target: num.optional().default(100),
});

export const feeSchema = z.object({
  name: nonEmpty,
  dept,
  fee: num.optional().default(0),
  target: num.optional().default(100),
  peer: num.optional().default(0),
});

export const workloadSchema = z.object({
  name: nonEmpty,
  current: num.optional(),
  prior: num.optional(),
  unit: z.string().optional().default("Item"),
});

export const capSchema = z.object({
  center: z.string().optional().default(""),
  pool: nonEmpty,
  amount: num.optional().default(0),
  basis: z.string().optional().default("FY budgeted"),
  recoverability: z.string().optional().default("Partially recoverable"),
});

/** The wrapper the AI tool returns per row. */
export const aiRawSuggestionSchema = z.object({
  sourceIndex: z.number(),
  domain: z.enum(["positions", "operating", "services", "workload", "cap", "fees"]),
  label: nonEmpty,
  entity: z.record(z.string(), z.unknown()),
  confidence,
  reasoning: nonEmpty,
});

export type RawSuggestion = z.infer<typeof aiRawSuggestionSchema>;

/** Maps a domain to its entity schema. */
export const ENTITY_SCHEMA = {
  positions: positionSchema,
  operating: operatingSchema,
  services: serviceSchema,
  fees: feeSchema,
  workload: workloadSchema,
  cap: capSchema,
} as const;

export type EntityFor<D extends keyof typeof ENTITY_SCHEMA> =
  z.infer<(typeof ENTITY_SCHEMA)[D]>;

/** Validate one raw suggestion's entity against its domain schema.
 *  Returns the parsed entity on success, or null + first issue message on failure. */
export function validateEntity(
  domain: RawSuggestion["domain"],
  entity: unknown,
): { ok: true; entity: Record<string, unknown> } | { ok: false; reason: string } {
  const result = ENTITY_SCHEMA[domain].safeParse(entity);
  if (result.success) {
    return { ok: true, entity: result.data as Record<string, unknown> };
  }
  const first = result.error.issues[0];
  const path = first?.path.join(".") || "(root)";
  return { ok: false, reason: `${path}: ${first?.message ?? "invalid"}` };
}
