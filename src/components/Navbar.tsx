"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function Navbar() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <header className="w-full border-b border-black/10 dark:border-white/15 bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Scripture Share
          </Link>
          <nav className="hidden sm:flex items-center gap-4 text-sm text-foreground/80">
            <Link href="/browse" className="hover:text-foreground">
              Browse
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {email ? (
            <>
              <span className="text-sm text-foreground/70 hidden sm:inline">{email}</span>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center rounded-md bg-foreground text-background px-3 py-1.5 text-sm font-medium hover:opacity-90"
              >
                Sign out
              </button>
            </>
          ) : (
            <GoogleSignInButton oneTap={false} showButton={true} />
          )}
        </div>
      </div>
    </header>
  );
}


