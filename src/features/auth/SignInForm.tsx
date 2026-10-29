"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/lib/auth";
import { safeReturnPath, signInHref } from "@/lib/safeRedirect";
import { socialCallbackURLs } from "@/lib/signInFlow";
import { authErrorMessage } from "./authErrors";
import {
  AuthOptionsLoading,
  AuthShell,
  AuthUnavailable,
  Divider,
  FormMessage,
  GoogleButton,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SignInUnavailableNotice,
  TextField,
  useAuthCapabilities,
} from "./AuthUi";

export default function SignInForm() {
  const { configured } = useAuth();
  if (!configured) return <AuthUnavailable />;
  return <SignInFormInner />;
}

function SignInFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, authUser, error: accountError } = useAuth();
  const capabilities = useAuthCapabilities();
  const returnTo = safeReturnPath(searchParams.get("redirect"));
  const redirectError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"email" | "google" | "passkey" | null>(null);
  const [error, setError] = useState<string | null>(redirectError ? authErrorMessage(redirectError) : null);
  const [info, setInfo] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const sessionError = authUser ? accountError : null;
  const waiting = finishing && !sessionError;

  useEffect(() => {
    if (user) router.replace(returnTo);
  }, [user, returnTo, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || waiting) return;
    setError(null);
    setInfo(null);
    setFinishing(false);
    setPending("email");
    try {
      const { error: signInError } = await authClient.signIn.email({ email: email.trim(), password, rememberMe: true });
      if (signInError) {
        if (signInError.code === "EMAIL_NOT_VERIFIED") {
          setInfo(
            capabilities?.emailDelivery
              ? "Confirm your email to finish signing in. We've sent you a new confirmation link."
              : authErrorMessage(signInError)
          );
        } else {
          setError(authErrorMessage(signInError));
        }
        return;
      }
      setFinishing(true);
    } catch {
      setError(authErrorMessage(null));
    } finally {
      setPending(null);
    }
  }

  async function handlePasskey() {
    if (pending || waiting) return;
    setError(null);
    setInfo(null);
    setPending("passkey");
    try {
      if (!window.isSecureContext || !window.PublicKeyCredential) {
        setError("Passkeys aren't supported in this browser. Use another sign-in method.");
        return;
      }
      const { error: passkeyError } = await authClient.signIn.passkey();
      if (passkeyError) {
        setError(authErrorMessage(passkeyError));
        return;
      }
      setFinishing(true);
    } catch {
      setError(authErrorMessage(null));
    } finally {
      setPending(null);
    }
  }

  async function handleGoogle() {
    if (pending || waiting) return;
    setError(null);
    setPending("google");
    try {
      const { error: socialError } = await authClient.signIn.social({
        provider: "google",
        ...socialCallbackURLs(returnTo, window.location.origin),
      });
      if (socialError) {
        setError(authErrorMessage(socialError));
        setPending(null);
      }
    } catch {
      setError(authErrorMessage(null));
      setPending(null);
    }
  }

  const signUpHref = signInHref(returnTo, "/sign-up");

  return (
    <AuthShell title="Sign in" subtitle="Welcome back. Sign in to keep your notes, highlights, and plans in sync.">
      <div className="space-y-4">
        <FormMessage tone="error">{error ?? sessionError}</FormMessage>
        <FormMessage tone="info">{info}</FormMessage>

        {capabilities === undefined ? (
          <AuthOptionsLoading />
        ) : (
          <>
            {capabilities.google ? (
              <GoogleButton onClick={handleGoogle} pending={pending === "google"} disabled={(pending !== null && pending !== "google") || waiting} />
            ) : null}
            {capabilities.passkey ? (
              <button type="button" className={`${SECONDARY_BUTTON_CLASS} w-full`} onClick={handlePasskey}
                disabled={pending !== null || waiting} aria-busy={pending === "passkey" || waiting}>
                {waiting ? "Opening your account…" : pending === "passkey" ? "Signing in…" : "Sign in with a passkey"}
              </button>
            ) : null}
            {capabilities.passkey ? <p className="text-sm text-[color:var(--foreground-muted)]">Already added a passkey? Use your fingerprint, face, device PIN, or security key.</p> : null}
            {capabilities.google && capabilities.emailPassword ? <Divider /> : null}
            {!capabilities.google && !capabilities.emailPassword && !capabilities.passkey ? <SignInUnavailableNotice /> : null}
            {capabilities.google && !capabilities.emailPassword ? (
              <p className="text-sm text-[color:var(--foreground-muted)]">
                New to Verse Together? Continuing with Google creates your account.
              </p>
            ) : null}
            {capabilities.emailPassword ? (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <TextField
                    label="Email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <TextField
                    label="Password"
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="submit"
                    className={PRIMARY_BUTTON_CLASS}
                    disabled={pending !== null || waiting}
                    aria-busy={pending === "email" || waiting}
                  >
                    {waiting ? "Opening your account…" : pending === "email" ? "Signing in…" : "Sign in"}
                  </button>
                </form>

                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  {capabilities.emailDelivery ? (
                    <Link href="/forgot-password" className="font-semibold underline underline-offset-2">
                      Forgot password?
                    </Link>
                  ) : (
                    <span />
                  )}
                  <Link href={signUpHref} className="font-semibold underline underline-offset-2">
                    Create an account
                  </Link>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </AuthShell>
  );
}

