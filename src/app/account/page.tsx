"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useAuth } from "@/lib/auth";

export default function AccountPage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-foreground/80">Please sign in to view your account.</p>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-foreground/70">
          Manage your profile and session from the Clerk user menu below.
        </p>
      </header>

      <div className="rounded-lg border border-black/10 dark:border-white/15 p-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Signed in as</div>
          <div className="text-sm text-foreground/70">{user.email ?? user.fullName ?? "Account user"}</div>
        </div>
        <UserButton afterSignOutUrl="/" />
      </div>

      <div className="rounded-lg border border-black/10 dark:border-white/15 p-4 space-y-2">
        <h2 className="text-base font-semibold">Where to go next</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/feed" className="rounded-md border border-black/10 dark:border-white/15 px-3 py-2 text-sm">
            Open Notes
          </Link>
          <Link href="/browse" className="rounded-md border border-black/10 dark:border-white/15 px-3 py-2 text-sm">
            Browse Scriptures
          </Link>
          <Link href="/help" className="rounded-md border border-black/10 dark:border-white/15 px-3 py-2 text-sm">
            Guide
          </Link>
        </div>
      </div>
    </section>
  );
}
