"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
      } else {
        const { error: e } = await supabase.auth.signUp({ email, password });
        if (e) throw e;
      }
      router.push("/");
    } catch (err: any) {
      setError(err?.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <section className="mx-auto max-w-md space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">{mode === "signin" ? "Sign in" : "Create account"}</h1>
        {userEmail ? (
          <p className="text-foreground/80">Signed in as {userEmail}</p>
        ) : (
          <p className="text-foreground/80">Use email and password</p>
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <label className="text-sm text-foreground/80">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm text-foreground/80">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-sm underline underline-offset-4"
            >
              {mode === "signin" ? "Create an account" : "Have an account? Sign in"}
            </button>
          </div>
          <div className="pt-2">
            <GoogleSignInButton oneTap={false} showButton={true} />
          </div>
        </form>
      )}
    </section>
  );
}


