/* Programmable Supabase-client mock for server route fixtures.
 *
 * The studies + organizations handlers call a narrow subset of the
 * Supabase JS surface:
 *
 *   db.from(table).select(cols)…       chainable filters …        .maybeSingle()
 *                                       .eq / .in / .is / .order   .single()
 *                                                                  await (PromiseLike)
 *   db.from(table).insert(row).select(cols).single()
 *   db.from(table).update(row).eq(col, val)
 *   db.from(table).upsert(row, { onConflict })
 *
 * Every chain method here just returns `this`; the terminal awaits or
 * `.maybeSingle() / .single()` resolve to the response that was queued
 * via `queueResponse(table, …)`. Queue is FIFO per table.
 *
 * Two key affordances:
 *   1. `recordedCalls` — every `from(table).<op>` invocation is
 *      appended so a fixture can assert "save handler upserted into
 *      study_drafts with these fields".
 *   2. Strict ordering — when a handler issues `from("studies")`
 *      before the fixture has queued a "studies" response, the mock
 *      throws synchronously. Forces tests to spell out the sequence
 *      they expect, which catches handler regressions like "we
 *      stopped reading the role lookup before the insert".
 *
 * The mock returns a duck-typed object cast to `SupabaseClient`. The
 * tests never touch Supabase's broader features (auth, storage, rpc),
 * so the cast is safe in practice. */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface MockResponse<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface MockCall {
  table: string;
  /** `insert` / `update` / `upsert` / `select` etc. — the most-recent
   *  terminal-or-mutation operation on the chain. Useful for handler
   *  assertions. */
  op: "select" | "insert" | "update" | "upsert" | "delete" | "unknown";
  /** Row payload for mutation ops; null for read ops. */
  payload: unknown;
  /** Filter clauses captured on the chain (eq/in/is). Helpful for
   *  asserting "the handler scoped the query by user_id". */
  filters: Array<{ kind: string; args: unknown[] }>;
}

export interface MockDb {
  client: SupabaseClient;
  queueResponse: <T>(table: string, response: MockResponse<T>) => void;
  calls: MockCall[];
  /** Reset everything between fixture cases. */
  reset: () => void;
}

class Chain<T> implements PromiseLike<MockResponse<T>> {
  constructor(private call: MockCall, private resolveResponse: () => MockResponse<T>) {}

  // Chainable filter / shape methods — record the call and return self.
  // Note: Chain.select does NOT overwrite call.op (unlike the entry-point
  // wrapped.select). Handlers commonly chain `.insert(...).select(...)`
  // to read back the inserted row; the recorded op must remain "insert"
  // for fixture assertions to find the call by op.
  select(cols: string): this { this.call.filters.push({ kind: "select", args: [cols] }); return this; }
  eq(col: string, val: unknown): this { this.call.filters.push({ kind: "eq", args: [col, val] }); return this; }
  in(col: string, vals: unknown[]): this { this.call.filters.push({ kind: "in", args: [col, vals] }); return this; }
  is(col: string, val: unknown): this { this.call.filters.push({ kind: "is", args: [col, val] }); return this; }
  order(col: string, opts?: unknown): this { this.call.filters.push({ kind: "order", args: [col, opts] }); return this; }
  limit(n: number): this { this.call.filters.push({ kind: "limit", args: [n] }); return this; }

  // Terminal: await the chain itself.
  then<TResult1 = MockResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: MockResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const v = this.resolveResponse();
    return Promise.resolve(v).then(onfulfilled, onrejected);
  }

  // Terminal: explicit row-shaping awaits.
  async single(): Promise<MockResponse<T>> { return this.resolveResponse(); }
  async maybeSingle(): Promise<MockResponse<T>> { return this.resolveResponse(); }
}

export function createMockDb(): MockDb {
  const queues = new Map<string, MockResponse<unknown>[]>();
  const calls: MockCall[] = [];

  const queueResponse = <T>(table: string, response: MockResponse<T>): void => {
    if (!queues.has(table)) queues.set(table, []);
    queues.get(table)!.push(response as MockResponse<unknown>);
  };

  const from = (table: string): unknown => {
    const call: MockCall = { table, op: "unknown", payload: null, filters: [] };
    calls.push(call);

    const resolveResponse = (): MockResponse<unknown> => {
      const queue = queues.get(table);
      if (!queue || queue.length === 0) {
        throw new Error(
          `mock: no response queued for from("${table}") (op=${call.op}). `
          + `Queue exhausted. Call history: ${JSON.stringify(calls.map((c) => `${c.table}.${c.op}`))}`,
        );
      }
      return queue.shift()!;
    };

    const chain = new Chain<unknown>(call, resolveResponse);

    // Mutation entry points decorate the chain with a recorded op.
    const wrapped = {
      select(cols: string) { call.op = "select"; call.filters.push({ kind: "select", args: [cols] }); return chain; },
      insert(payload: unknown) { call.op = "insert"; call.payload = payload; return chain; },
      update(payload: unknown) { call.op = "update"; call.payload = payload; return chain; },
      upsert(payload: unknown, opts?: unknown) { call.op = "upsert"; call.payload = payload; if (opts) call.filters.push({ kind: "upsertOpts", args: [opts] }); return chain; },
      delete() { call.op = "delete"; return chain; },
    };
    return wrapped;
  };

  const client = { from } as unknown as SupabaseClient;

  return {
    client,
    queueResponse,
    calls,
    reset(): void {
      queues.clear();
      calls.length = 0;
    },
  };
}
