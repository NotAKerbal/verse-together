"use client";

import Link from "next/link";
import AccountManager from "@/features/auth/AccountManager";

export default function AccountPage() {
  return (
    <section className="page-shell space-y-3 py-6">
      <header className="page-hero space-y-1">
        <div className="page-eyebrow">Account</div>
        <h1 className="page-title mt-2">Account</h1>
        <p className="page-subtitle mt-3 text-sm">Manage your profile, sign-in methods, and sessions.</p>
      </header>

      <AccountManager />

      <div className="panel-card space-y-2 rounded-[1.35rem] p-4">
        <h2 className="text-base font-semibold">Where to go next</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/notes" className="surface-button rounded-full border px-4 py-2 text-sm">
            Open Journal
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
