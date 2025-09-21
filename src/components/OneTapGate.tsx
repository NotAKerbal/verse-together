"use client";

import { useEffect, useState } from "react";
import GoogleSignInButton from "./GoogleSignInButton";
import { useAuth } from "@/lib/auth";

const SESSION_KEY = "one_tap_prompted";

export default function OneTapGate() {
  const { user, loading } = useAuth();
  const [shouldPrompt, setShouldPrompt] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (user) return;

    if (typeof window === "undefined") return;

    const hasPrompted = sessionStorage.getItem(SESSION_KEY) === "1";
    if (hasPrompted) {
      setShouldPrompt(false);
      return;
    }

    // Mark as prompted for this session to enforce once-per-session behavior and trigger prompt
    sessionStorage.setItem(SESSION_KEY, "1");
    setShouldPrompt(true);
  }, [user, loading]);

  // Render hidden One Tap when not signed in, not loading, and not yet prompted
  if (loading || user || !shouldPrompt) return null;

  return (
    <div className="sr-only" aria-hidden>
      <GoogleSignInButton oneTap={true} showButton={false} />
    </div>
  );
}


