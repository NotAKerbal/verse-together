"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { SignInButton } from "@clerk/nextjs";

export default function AuthPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.refresh();
    setSigningOut(false);
  }

  return (
    <section className="mx-auto max-w-md space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        {user?.email ? (
          <p className="text-foreground/80">Signed in as {user.email}</p>
        ) : (
          <p className="text-foreground/80">Sign in to share and discuss verses</p>
        )}
      </header>

      {user?.email ? (
        <div className="flex items-center justify-center">
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <SignInButton mode="modal">
              <button className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90">
                Sign in
              </button>
            </SignInButton>
          </div>
        </div>
      )}
    </section>
  );
}


