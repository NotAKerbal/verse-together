// Loads the account page's two lists (sign-in methods and sessions) independently, so one failing never discards
// the other, and says whether a failure can be fixed by retrying or needs a new sign-in. Better Auth's
// /list-sessions needs a fresh session (signed in within the last day) and answers SESSION_NOT_FRESH otherwise;
// retrying can never fix that, only signing in again can.

import { authErrorMessage } from "./authErrors.ts";

export type AuthResult<T> = { data?: T | null; error?: { code?: string | null; status?: number | null } | null };

export type ListProblem = { reauthenticate: boolean; message: string };

export type AccountListsOutcome<A, S> = {
  /** Present only when that list loaded; otherwise keep the last good value. */
  accounts?: A[];
  sessions?: S[];
  failed: { accounts: boolean; sessions: boolean };
  problem: ListProblem | null;
};

const REAUTHENTICATE_CODES = new Set(["SESSION_EXPIRED", "SESSION_NOT_FRESH", "UNAUTHORIZED"]);

export const REAUTHENTICATE_MESSAGE = "For your security, sign in again to see your sign-in methods and devices.";

export function needsReauthentication(error: { code?: string | null; status?: number | null } | null | undefined): boolean {
  if (!error) return false;
  return (!!error.code && REAUTHENTICATE_CODES.has(error.code)) || error.status === 401;
}

type Settled<T> = { ok: true; data: T[] } | { ok: false; error: { code?: string | null; status?: number | null } | null };

async function settle<T>(load: () => Promise<AuthResult<T[]>>): Promise<Settled<T>> {
  try {
    const result = await load();
    if (result.error) return { ok: false, error: result.error };
    return { ok: true, data: result.data ?? [] };
  } catch {
    return { ok: false, error: null };
  }
}

export async function loadAccountLists<A, S>(load: {
  accounts: () => Promise<AuthResult<A[]>>;
  sessions: () => Promise<AuthResult<S[]>>;
}): Promise<AccountListsOutcome<A, S>> {
  const [accounts, sessions] = await Promise.all([settle(load.accounts), settle(load.sessions)]);
  const errors = [accounts, sessions].flatMap((result) => (result.ok ? [] : [result.error]));
  // A failure that needs a new sign-in wins: retrying can't fix it, so offering only "Reload" would loop.
  const reauthenticate = errors.some(needsReauthentication);
  const problem: ListProblem | null =
    errors.length === 0
      ? null
      : reauthenticate
        ? { reauthenticate: true, message: REAUTHENTICATE_MESSAGE }
        : { reauthenticate: false, message: authErrorMessage(errors[0]) };
  return {
    ...(accounts.ok ? { accounts: accounts.data } : {}),
    ...(sessions.ok ? { sessions: sessions.data } : {}),
    failed: { accounts: !accounts.ok, sessions: !sessions.ok },
    problem,
  };
}
