"use client";

// /delete-account: deleting a Verse Together account from the web, for people using the website or the app (the
// app's store listing links here). The same POST /delete-user the app uses: Better Auth checks the session is the
// owner's own and fresh (signed in within the last day) and rate limits it; convex/auth.ts deletes the app data
// first, so a deletion that stops partway can be finished here by deleting again. Only the Better Auth session is
// needed, not a loaded app account: one whose deletion stopped partway has none.

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/lib/auth";
import { authErrorMessage } from "./authErrors";
import { AuthShell, FormMessage, GoogleButton, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "./AuthUi";

const PATH = "/delete-account";

const WHAT_IS_DELETED =
  "Your account and everything saved in it, on the website and in the app: journal entries, notes, marks, reading history, goals, plans, shares, comments and friends. Your Google sign-in is unlinked.";

export default function DeleteAccount() {
  const auth = useAuth();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <AuthShell title="Account deleted">
        <FormMessage tone="success">Your Verse Together account and the study saved in it were deleted.</FormMessage>
        <p className="mt-3 text-sm text-[color:var(--foreground-muted)]">
          Study saved only in the app on a device stays on that device until you remove it there or uninstall the app.
        </p>
        <Link href="/" className={`${SECONDARY_BUTTON_CLASS} mt-4 w-full`}>
          Go to Verse Together
        </Link>
      </AuthShell>
    );
  }

  if (!auth.configured) {
    return (
      <AuthShell title="Delete your account" subtitle="Accounts aren't available on this copy of Verse Together." />
    );
  }

  if (!auth.authUser) {
    if (auth.loading) {
      return (
        <AuthShell title="Delete your account">
          <p role="status" aria-busy="true" className="text-sm text-[color:var(--foreground-muted)]">
            Checking whether you&apos;re signed in…
          </p>
        </AuthShell>
      );
    }
    return (
      <AuthShell title="Delete your account" subtitle="Sign in with the Google account you use for Verse Together, on the website or in the app.">
        <p className="text-sm">{WHAT_IS_DELETED}</p>
        <p className="mt-3 text-sm text-[color:var(--foreground-muted)]">You&apos;ll confirm before anything is deleted.</p>
        <div className="mt-4">
          <GoogleButton
            label="Sign in with Google to continue"
            pending={auth.signingIn}
            onClick={() => auth.promptSignIn(PATH)}
          />
        </div>
      </AuthShell>
    );
  }

  return <ConfirmDeletion email={auth.authUser.email} resume={!!auth.pendingDeletion} onDeleted={() => setDone(true)} />;
}

function ConfirmDeletion({ email, resume, onDeleted }: { email: string; resume: boolean; onDeleted: () => void }) {
  const auth = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<{ text: string; reauthenticate: boolean } | null>(null);

  async function remove() {
    if (!confirmed || pending) return;
    setPending(true);
    setProblem(null);
    try {
      const { error } = await authClient.deleteUser({});
      if (error) {
        const reauthenticate = error.code === "SESSION_EXPIRED" || error.code === "SESSION_NOT_FRESH";
        setProblem({
          text: reauthenticate ? "For your security, sign in with Google again, then delete your account." : authErrorMessage(error),
          reauthenticate,
        });
        return;
      }
      onDeleted();
      // The session went with the account; let the rest of the site see it.
      authClient.$store.notify("$sessionSignal");
    } catch {
      setProblem({ text: "Verse Together couldn't be reached. Check your connection and try again.", reauthenticate: false });
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title={resume ? "Finish deleting your account" : "Delete your account"} subtitle={<>Signed in as <strong>{email}</strong>.</>}>
      {resume ? (
        <FormMessage tone="info">
          Deleting this account started but didn&apos;t finish. Its study can&apos;t be used any more; finish deleting it to
          remove what&apos;s left.
        </FormMessage>
      ) : null}
      <p className="mt-3 text-sm">This permanently deletes {WHAT_IS_DELETED.charAt(0).toLowerCase() + WHAT_IS_DELETED.slice(1)}</p>
      <p className="mt-3 text-sm text-[color:var(--foreground-muted)]">
        Study saved only in the app on a device stays there. This can&apos;t be undone.
      </p>
      <label className="mt-4 flex items-start gap-2 text-sm font-semibold">
        <input type="checkbox" className="mt-1" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        I understand my account and its study will be permanently deleted.
      </label>
      <button
        type="button"
        className={`${PRIMARY_BUTTON_CLASS} mt-4`}
        disabled={!confirmed || pending || auth.signingIn}
        aria-busy={pending || undefined}
        onClick={() => void remove()}
      >
        {pending ? "Deleting…" : resume ? "Finish deleting my account" : "Delete my account permanently"}
      </button>
      {problem ? (
        <div className="mt-3 space-y-3">
          <FormMessage tone="error">{problem.text}</FormMessage>
          {problem.reauthenticate ? (
            <GoogleButton label="Sign in with Google again" pending={auth.signingIn} onClick={() => auth.promptSignIn(PATH)} />
          ) : null}
        </div>
      ) : null}
      {!resume ? (
        <Link href="/account" className={`${SECONDARY_BUTTON_CLASS} mt-4 w-full`}>
          Keep my account
        </Link>
      ) : null}
    </AuthShell>
  );
}
