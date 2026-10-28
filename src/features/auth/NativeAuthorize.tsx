"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/lib/auth";
import { nativeCallbackUrl, nativeDeclinedUrl, parseNativeAuthorizeRequest } from "../../../convex/nativeAuthRules";
import { AuthShell, FormMessage, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "./AuthUi";

/**
 * The website half of desktop sign-in (convex/nativeAuthRules.ts). The desktop app opened this page in the
 * system browser. Signed in here, the reader explicitly approves; the page then asks the server for a single-use
 * code bound to the app's PKCE challenge and hands it to the app's listener on 127.0.0.1. Nothing is approved
 * without the click, so visiting a crafted link can't sign an app in.
 */
export default function NativeAuthorize() {
  const params = useSearchParams();
  const request = parseNativeAuthorizeRequest(new URLSearchParams(params.toString()));
  const { authUser, loading, promptSignIn, signingIn } = useAuth();
  const [status, setStatus] = useState<"idle" | "working" | "sent" | "declined">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!request) {
    return (
      <AuthShell title="Desktop sign-in" subtitle="This sign-in link is incomplete or has been changed.">
        <FormMessage tone="error">Start signing in again from the Verse Together desktop app.</FormMessage>
      </AuthShell>
    );
  }

  if (loading) {
    return <AuthShell title="Desktop sign-in" subtitle="Checking your account…" />;
  }

  if (!authUser) {
    return (
      <AuthShell
        title="Sign in to continue"
        subtitle="Sign in on the website first. You'll come back here to approve the desktop app."
      >
        <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={signingIn} onClick={() => promptSignIn()}>
          {signingIn ? "Opening sign-in…" : "Sign in"}
        </button>
      </AuthShell>
    );
  }

  async function approve() {
    if (!request || !authUser) return;
    setStatus("working");
    setError(null);
    try {
      const { data, error: failure } = await authClient.$fetch<{ code: string }>("/native/grant", {
        method: "POST",
        body: { challenge: request.challenge, expectedUserId: authUser.id },
      });
      if (failure || !data?.code) {
        setStatus("idle");
        setError(
          failure?.status === 409
            ? "You're signed in to a different account now. Reload this page to check which account you're approving."
            : failure?.status === 401
              ? "Your session on this site ended. Sign in again, then approve."
              : "The desktop app couldn't be approved. Check your connection and try again."
        );
        return;
      }
      setStatus("sent");
      window.location.assign(nativeCallbackUrl(request, data.code));
    } catch {
      setStatus("idle");
      setError("The desktop app couldn't be approved. Check your connection and try again.");
    }
  }

  function decline() {
    if (!request) return;
    setStatus("declined");
    // Tells the app at once, so it stops waiting for this sign-in.
    window.location.assign(nativeDeclinedUrl(request));
  }

  if (status === "sent") {
    return (
      <AuthShell title="Return to the app" subtitle="Verse Together on your computer is finishing signing in.">
        <p className="text-sm text-[color:var(--foreground-muted)]">You can close this tab.</p>
      </AuthShell>
    );
  }
  if (status === "declined") {
    return (
      <AuthShell title="Not approved" subtitle="The desktop app was not signed in. You can close this tab." />
    );
  }

  return (
    <AuthShell
      title="Sign in to the desktop app?"
      subtitle={
        <>
          Verse Together on this computer will sync your notes, highlights, and goals with{" "}
          <strong>{authUser.email}</strong>. Only approve if you just chose to sign in from the app.
        </>
      }
    >
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <div className="mt-3 flex flex-col gap-2">
        <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={status === "working"} onClick={() => void approve()}>
          {status === "working" ? "Approving…" : "Approve and return to the app"}
        </button>
        <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={status === "working"} onClick={decline}>
          Cancel
        </button>
      </div>
    </AuthShell>
  );
}
