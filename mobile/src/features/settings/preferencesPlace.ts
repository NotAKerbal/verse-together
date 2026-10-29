// Where a reader-preference change made now is saved, in the words Settings shows under a card's title (the web's
// "Your account" or "This device"), with how the account's copy is getting there when signed in.

/** Shown, with the account's settings disabled, until the account's own copy has been read on this device. */
export const ACCOUNT_SETTINGS_LOADING = "Loading your account’s settings…";

import { appearancePending, presetsPending, readAccountPrefs, useReaderPreferences, usePreferencesOwner } from "../../storage/preferences";
import { usePreferencesSyncState } from "./preferencesSync";

export function usePreferencesPlace(): string {
  // Re-read whenever the preferences shown (and so the account's waiting changes) change.
  useReaderPreferences();
  const owner = usePreferencesOwner();
  const state = usePreferencesSyncState(owner.kind === "account" ? owner.owner : null);
  if (owner.kind === "device") return "This device";
  if (owner.kind === "pending") return "Your account is being checked · Changes aren't saved yet";
  const record = readAccountPrefs(owner.owner);
  if (!record.fromServer) return `Your account · ${ACCOUNT_SETTINGS_LOADING}`;
  const waiting = appearancePending(record) || presetsPending(record);
  if (state === "saving") return "Your account · Saving…";
  if (state === "error") return "Your account · Not saved to your account yet; trying again";
  if (waiting) return "Your account · Saved here, waiting to reach your account";
  return "Your account";
}
