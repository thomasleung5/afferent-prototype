/* Confirmation copy for destructive model actions.
 *
 * Pure functions extracted from ModelSettingsMenu so each variant
 * (with vs without an active server study) can be unit-tested
 * without React.
 *
 * Reset and Clear keep their existing behavior — they mutate the
 * store and autosave picks the change up like any other edit. The
 * copy makes the side-effect explicit so the user can't be surprised.
 *
 * Demo workspace switching is treated as a SANDBOX action: when a
 * server study is active, ModelSettingsMenu detaches the active
 * study (via clearActiveStudy()) and suppresses autosave around the
 * store mutation. The confirmation copy describes that detach. */

interface ConfirmArgs {
  /** Display name of the active jurisdiction (e.g. "Los Altos Hills"). */
  jurisdictionName: string;
  /** Display name of the active server study, or null when in local-only. */
  activeStudyName: string | null;
  /** True when reset returns the demo to an empty workspace instead of seeded data. */
  blankWorkspace?: boolean;
}

export function resetConfirmCopy(args: ConfirmArgs): string {
  const head = args.blankWorkspace
    ? `Reset ${args.jurisdictionName} to a blank workspace?`
    : `Reset ${args.jurisdictionName} to the seed model?`;
  const body = "Local edits will be discarded.";
  if (args.activeStudyName) {
    return [
      head, "",
      body, "",
      `Because "${args.activeStudyName}" is active, auto-save will also update that server draft.`,
    ].join("\n");
  }
  return `${head}\n\n${body}`;
}

export function clearConfirmCopy(args: ConfirmArgs): string {
  const head = `Clear all build data for ${args.jurisdictionName}?`;
  const body = args.blankWorkspace
    ? "This empties every input slice."
    : "This empties every input slice — including the seed. You can re-seed afterward with Reset.";
  if (args.activeStudyName) {
    return [
      head, "",
      body, "",
      `Because "${args.activeStudyName}" is active, auto-save will also update that server draft.`,
    ].join("\n");
  }
  return `${head}\n\n${body}`;
}

export interface SwitchConfirmDecision {
  /** True iff the user must confirm before the switch proceeds.
   *  Always true when an active study is set; false in local-only
   *  mode where the demo switch is non-destructive. */
  needsConfirm: boolean;
  /** Message body for `window.confirm`. Empty when `needsConfirm` is
   *  false — callers can skip the prompt entirely. */
  message: string;
}

export function switchConfirmCopy(args: ConfirmArgs): SwitchConfirmDecision {
  if (!args.activeStudyName) {
    return { needsConfirm: false, message: "" };
  }
  return {
    needsConfirm: true,
    message: [
      `Switch to ${args.jurisdictionName}?`, "",
      `This loads a different demo workspace. The active study `
        + `"${args.activeStudyName}" will be detached and its server draft `
        + `will not be modified.`, "",
      "You can re-select the study afterward to resume auto-save.",
    ].join("\n"),
  };
}
