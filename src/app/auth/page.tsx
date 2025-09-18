"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // Email/password flow removed; Google-only sign-in

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <section className="mx-auto max-w-md space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        {userEmail ? (
          <p className="text-foreground/80">Signed in as {userEmail}</p>
        ) : (
          <p className="text-foreground/80">Use your Google account</p>
        )}
      </header>

      {userEmail ? (
        <div className="flex items-center justify-center">
          <button
            onClick={handleSignOut}
            className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Sign out
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <GoogleSignInButton oneTap={false} showButton={true} />
          </div>
          <p className="text-xs text-foreground/70 text-center">We also use Google One Tap on the homepage for faster sign-in.</p>
        </div>
      )}
    </section>
  );
}


