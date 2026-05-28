export type Tone = "neg" | "warn" | "pos" | "info";

/** Canonical mapping from semantic tone → CSS variable. Used by components
 *  that take a `tone` prop (e.g. AnswerHeader) so coloring stays consistent
 *  across pages. For one-off literals where the sign is already known at
 *  the call site, `var(--neg)` / `var(--pos)` directly is fine. */
export const TONE_COLOR: Record<Tone, string> = {
  neg: "var(--neg)",
  warn: "var(--warn)",
  pos: "var(--pos)",
  info: "var(--ink)",
};
