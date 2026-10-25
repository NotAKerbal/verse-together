"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/lib/auth";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../../../convex/authEnvironment";
import { authErrorMessage } from "./authErrors";
import {
  AuthOptionsLoading,
  AuthShell,
  AuthUnavailable,
  FormMessage,
  PRIMARY_BUTTON_CLASS,
  TextField,
  useAuthCapabilities,
} from "./AuthUi";

/**
 * Both password routes while email/password is switched off (the default): no form, and no request
 * would succeed anyway because the server refuses every password endpoint.
 */
function PasswordsUnavailable() {
  return (
    <AuthShell title="Sign in with Google">
      <FormMessage tone="info">
        Verse Together uses Google sign-in for now, so there&apos;s no password to reset. Choose Continue with Google
        and pick the Google account that uses your email address. Email and password sign-in is coming later.
      </FormMessage>
      <Link href="/sign-in" className="mt-4 inline-block text-sm font-semibold underline underline-offset-2">
        Go to sign in
      </Link>
    </AuthShell>
  );
}

function PasswordOptionsLoading({ title }: { title: string }) {
  return (
    <AuthShell title={title}>
      <AuthOptionsLoading />
    </AuthShell>
  );
}

export function ForgotPasswordForm() {
  const { configured } = useAuth();
  if (!configured) return <AuthUnavailable />;
  return <ForgotPasswordInner />;
}

function ForgotPasswordInner() {
  const capabilities = useAuthCapabilities();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const { error: requestError } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: "/reset-password",
      });
      if (requestError) {
        setError(authErrorMessage(requestError));
        return;
      }
      // Same message whether or not an account exists, so the form can't be used to probe emails.
      setSent(true);
    } catch {
      setError(authErrorMessage(null));
    } finally {
      setPending(false);
    }
  }

  if (!capabilities) return <PasswordOptionsLoading title="Reset your password" />;
  if (!capabilities.emailPassword) return <PasswordsUnavailable />;
  if (!capabilities.emailDelivery) {
    return (
      <AuthShell title="Reset your password">
        <FormMessage tone="info">
          Password reset by email isn&apos;t set up on this site yet. If you signed in with Google before, use Continue
          with Google on the sign-in page.
        </FormMessage>
        <Link href="/sign-in" className="mt-4 inline-block text-sm font-semibold underline underline-offset-2">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we'll send you a link to choose a new password.">
      {sent ? (
        <FormMessage tone="success">
          If an account uses <strong>{email.trim()}</strong>, a reset link is on its way. It expires in one hour.
        </FormMessage>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormMessage tone="error">{error}</FormMessage>
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
          <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={pending} aria-busy={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <Link href="/sign-in" className="mt-4 inline-block text-sm font-semibold underline underline-offset-2">
        Back to sign in
      </Link>
    </AuthShell>
  );
}

export function ResetPasswordForm() {
  const { configured } = useAuth();
  if (!configured) return <AuthUnavailable />;
  return <ResetPasswordInner />;
}

function ResetPasswordInner() {
  const capabilities = useAuthCapabilities();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const linkError = searchParams.get("error");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const passwordError =
    touched && password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      : null;
  const confirmError = touched && confirm.length > 0 && confirm !== password ? "Passwords don't match." : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (pending || !token) return;
    if (password.length < MIN_PASSWORD_LENGTH || password !== confirm) return;
    setError(null);
    setPending(true);
    try {
      const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
      if (resetError) {
        setError(authErrorMessage(resetError));
        return;
      }
      setDone(true);
    } catch {
      setError(authErrorMessage(null));
    } finally {
      setPending(false);
    }
  }

  if (!capabilities) return <PasswordOptionsLoading title="Choose a new password" />;
  if (!capabilities.emailPassword) return <PasswordsUnavailable />;

  if (!token || linkError) {
    return (
      <AuthShell title="Reset your password">
        <FormMessage tone="error">{authErrorMessage(linkError ?? "INVALID_TOKEN")}</FormMessage>
        <Link href="/forgot-password" className="mt-4 inline-block text-sm font-semibold underline underline-offset-2">
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated">
        <FormMessage tone="success">Your password has been changed and other sessions were signed out.</FormMessage>
        <button type="button" className={`${PRIMARY_BUTTON_CLASS} mt-4`} onClick={() => router.replace("/sign-in")}>
          Sign in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormMessage tone="error">{error}</FormMessage>
        <TextField
          label="New password"
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
          label="Confirm new password"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          required
          error={confirmError}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}
