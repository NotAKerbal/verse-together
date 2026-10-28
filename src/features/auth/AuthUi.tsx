"use client";

import Link from "next/link";
import { useId, type InputHTMLAttributes, type PropsWithChildren, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { AuthCapabilities } from "../../../convex/authEnvironment";

export type { AuthCapabilities };

/**
 * What this deployment has configured; undefined while loading. Needs the Convex provider. Treat
 * undefined as "offer nothing yet" so email/password controls never flash in Google-only mode.
 */
export function useAuthCapabilities(): AuthCapabilities | undefined {
  return useQuery(api.auth.capabilities, {}) as AuthCapabilities | undefined;
}

export const INPUT_CLASS =
  "mt-1 block w-full rounded-xl border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card-strong)] px-3 py-2.5 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] aria-[invalid=true]:border-[color:var(--accent-secondary)] sm:text-sm";

export const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:cursor-not-allowed disabled:opacity-60";

export const SECONDARY_BUTTON_CLASS =
  "surface-button inline-flex min-h-11 items-center justify-center rounded-full border-2 px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:cursor-not-allowed disabled:opacity-60";

export function AuthShell({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: ReactNode }>) {
  return (
    <main className="page-shell py-6 sm:py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="panel-card rounded-[1.35rem] p-5 sm:p-6">
          <h1 className="page-title">{title}</h1>
          {subtitle ? <p className="page-subtitle mt-2 text-sm">{subtitle}</p> : null}
          <div className="mt-5">{children}</div>
        </div>
        <p className="mt-4 text-center text-xs text-[color:var(--foreground-muted)]">
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy policy
          </Link>
        </p>
      </div>
    </main>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null };

export function TextField({ label, hint, error, id, ...input }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-semibold">
        {label}
      </label>
      <input
        id={inputId}
        className={INPUT_CLASS}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        {...input}
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-[color:var(--foreground-muted)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-xs font-semibold text-[color:var(--accent-secondary)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Errors are announced assertively; confirmations politely. */
export function FormMessage({ tone, children }: PropsWithChildren<{ tone: "error" | "success" | "info" }>) {
  if (!children) return null;
  const color =
    tone === "error"
      ? "border-[color:var(--accent-secondary)] text-[color:var(--accent-secondary)]"
      : "border-[color:var(--surface-border)] text-[color:var(--foreground)]";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border-2 px-3 py-2 text-sm ${color}`}>
      {children}
    </div>
  );
}

export function GoogleButton({
  onClick,
  pending,
  disabled,
  label = "Continue with Google",
}: {
  onClick: () => void;
  pending: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || pending} className={`${SECONDARY_BUTTON_CLASS} w-full gap-2`}>
      <svg aria-hidden="true" viewBox="0 0 18 18" width="18" height="18">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
      </svg>
      {pending ? "Opening Google…" : label}
    </button>
  );
}

export function AuthUnavailable() {
  return (
    <AuthShell title="Sign in" subtitle="Accounts aren't available on this copy of Verse Together.">
      <p className="text-sm text-[color:var(--foreground-muted)]">
        You can keep reading and browsing without an account.
      </p>
      <Link href="/browse" className={`${SECONDARY_BUTTON_CLASS} mt-4 w-full`}>
        Browse scriptures
      </Link>
    </AuthShell>
  );
}

/** Placeholder while the deployment's sign-in options load. */
export function AuthOptionsLoading() {
  return (
    <p role="status" aria-busy="true" className="text-sm text-[color:var(--foreground-muted)]">
      Loading sign-in options…
    </p>
  );
}

/** Shown when no sign-in method is configured on the deployment (for example Google keys are missing). */
export function SignInUnavailableNotice() {
  return (
    <FormMessage tone="info">
      Sign-in isn&apos;t available right now. You can keep reading and browsing without an account; please try again
      later.
    </FormMessage>
  );
}

export function Divider() {
  return (
    <div className="my-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--foreground-muted)]">
      <span className="h-px flex-1 bg-[color:var(--surface-border)]" />
      or
      <span className="h-px flex-1 bg-[color:var(--surface-border)]" />
    </div>
  );
}
