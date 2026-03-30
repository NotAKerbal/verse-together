"use client";

import Link from "next/link";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { useAuth } from "@/lib/auth";

export default function AccountPage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <section className="page-shell py-6">
        <div className="page-hero">
          <div className="page-eyebrow">Account</div>
          <h1 className="page-title mt-2">Account</h1>
          <p className="page-subtitle mt-3 text-sm">Sign in to view your account details and manage your session.</p>
        </div>
        <SignInButton mode="modal">
          <button className="surface-button inline-flex rounded-full border px-4 py-2 text-sm">
            Sign in
          </button>
        </SignInButton>
      </section>
    );
  }

  return (
    <section className="page-shell py-6">
      <header className="page-hero space-y-1">
        <div className="page-eyebrow">Account</div>
        <h1 className="page-title mt-2">Account</h1>
        <p className="page-subtitle mt-3 text-sm">
          Manage your profile and session from the Clerk user menu below.
        </p>
      </header>

      <div className="panel-card rounded-[1.35rem] p-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Signed in as</div>
          <div className="text-sm text-[color:var(--foreground-muted)]">{user.email ?? user.fullName ?? "Account user"}</div>
        </div>
        <UserButton afterSignOutUrl="/" />
      </div>

      <div className="panel-card rounded-[1.35rem] p-4 space-y-2">
        <h2 className="text-base font-semibold">Where to go next</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/notes" className="surface-button rounded-full border px-4 py-2 text-sm">
            Open Notes
          </Link>
          <Link href="/browse" className="surface-button rounded-full border px-4 py-2 text-sm">
            Browse Scriptures
          </Link>
          <Link href="/help" className="surface-button rounded-full border px-4 py-2 text-sm">
            Guide
          </Link>
        </div>
      </div>
    </section>
  );
}
