"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { signInHref } from "@/lib/safeRedirect";

/**
 * A "Sign in" link that starts signing in on the spot (straight to Google on Google-only deployments)
 * and returns to `returnTo`. It stays a real link to the sign-in page, so it works before hydration and
 * for modified clicks (new tab or window).
 */
export default function SignInLink({ returnTo, className, children = "Sign in" }: { returnTo: string; className?: string; children?: ReactNode }) {
  const { promptSignIn, signingIn } = useAuth();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    promptSignIn(returnTo);
  }

  return (
    <Link
      href={signInHref(returnTo)}
      onClick={handleClick}
      className={`${className ?? ""} aria-disabled:cursor-wait aria-disabled:opacity-70`}
      aria-disabled={signingIn || undefined}
      aria-busy={signingIn || undefined}
    >
      {signingIn ? "Signing in…" : children}
    </Link>
  );
}
