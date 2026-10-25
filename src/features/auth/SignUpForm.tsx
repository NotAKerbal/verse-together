"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/lib/auth";
import { appURL, safeReturnPath, signInHref } from "@/lib/safeRedirect";
import { socialCallbackURLs } from "@/lib/signInFlow";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../../../convex/authEnvironment";
import { authErrorMessage } from "./authErrors";
import {
  AuthOptionsLoading,
  AuthShell,
  AuthUnavailable,
  Divider,
  FormMessage,
  GoogleButton,
  PRIMARY_BUTTON_CLASS,
  SignInUnavailableNotice,
  TextField,
  useAuthCapabilities,
} from "./AuthUi";

export default function SignUpForm() {
  const { configured } = useAuth();
  if (!configured) return <AuthUnavailable />;
  return <SignUpFormInner />;
}

function SignUpFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, authUser, error: accountError } = useAuth();
  const capabilities = useAuthCapabilities();
  const returnTo = safeReturnPath(searchParams.get("redirect"));

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  // Account created and signed in; waiting for Convex to verify the session and provision the app user.
  const [finishing, setFinishing] = useState(false);
  const sessionError = authUser ? accountError : null;
  const waiting = finishing && !sessionError;

  // Navigate only once the app user is ready, so server-rendered pages see a provisioned account.
  useEffect(() => {
    if (user) router.replace(returnTo);
  }, [user, returnTo, router]);

  const passwordError =
    touched && password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      : null;
  const confirmError = touched && confirm.length > 0 && confirm !== password ? "Passwords don't match." : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (pending || waiting) return;
    if (password.length < MIN_PASSWORD_LENGTH || password !== confirm) return;
    setError(null);
    setFinishing(false);
    setPending("email");
    try {
      const { data, error: signUpError } = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
        callbackURL: appURL(returnTo, window.location.origin),
      });
      if (signUpError) {
        setError(authErrorMessage(signUpError));
        return;
      }
      if (data && "token" in data && data.token) {
        setFinishing(true);
      } else {
        // Verification is required before the first sign-in.
        setSentTo(email.trim());
      }
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
        ...socialCallbackURLs(returnTo, window.location.origin, "/sign-up"),
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

  if (sentTo) {
    return (
      <AuthShell title="Check your email">
        <FormMessage tone="success">
          We sent a confirmation link to <strong>{sentTo}</strong>. Open it to finish creating your account.
        </FormMessage>
        <Link href={signInHref(returnTo)} className="mt-4 inline-block text-sm font-semibold underline underline-offset-2">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create an account" subtitle="Save notes, highlights, and reading plans across your devices.">
      <div className="space-y-4">
        <FormMessage tone="error">{error ?? sessionError}</FormMessage>

        {capabilities === undefined ? (
          <AuthOptionsLoading />
        ) : (
          <>
            {capabilities.google ? (
              <GoogleButton onClick={handleGoogle} pending={pending === "google"} disabled={pending === "email" || waiting} />
            ) : null}
            {capabilities.google && capabilities.emailPassword ? <Divider /> : null}
            {!capabilities.google && !capabilities.emailPassword ? <SignInUnavailableNotice /> : null}
            {capabilities.emailPassword ? (
              // Dormant until AUTH_EMAIL_PASSWORD_ENABLED=true on the Convex deployment.
              <form onSubmit={handleSubmit} className="space-y-4">
                <TextField
                  label="Name"
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
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
                  name="new-password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={MAX_PASSWORD_LENGTH}
                  hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                  error={passwordError}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <TextField
                  label="Confirm password"
                  type="password"
                  name="confirm-password"
                  autoComplete="new-password"
                  required
                  error={confirmError}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
                <button
                  type="submit"
                  className={PRIMARY_BUTTON_CLASS}
                  disabled={pending !== null || waiting}
                  aria-busy={pending === "email" || waiting}
                >
                  {waiting ? "Opening your account…" : pending === "email" ? "Creating account…" : "Create account"}
                </button>
              </form>
            ) : null}
          </>
        )}

        <p className="text-sm">
          Already have an account?{" "}
          <Link href={signInHref(returnTo)} className="font-semibold underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
