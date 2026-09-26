"use client";

import { useAuth } from "@/lib/auth";

export default function PlansSignedOut() {
  const { promptSignIn } = useAuth();

  return (
    <div className="panel-card flex flex-col items-start gap-3 p-5" style={{ background: "var(--accent-sky-soft)" }}>
      <h2 className="font-display text-[1.25rem] font-bold leading-tight">Sign in to keep a plan</h2>
      <p className="max-w-[40rem] text-sm text-[color:var(--foreground-muted)]">
        Plans, read chapters, and your last reading spot are saved to your account so they follow you between devices.
      </p>
      <button
        type="button"
        onClick={() => promptSignIn()}
        className="inline-flex min-h-10 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)]"
      >
        Sign in
      </button>
    </div>
  );
}
