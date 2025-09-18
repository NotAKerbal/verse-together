"use client";

import Script from "next/script";
import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

declare const google: any;

async function generateNonce(): Promise<{ nonce: string; hashedNonce: string }> {
  const nonce = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))
  );
  const encoder = new TextEncoder();
  const encodedNonce = encoder.encode(nonce);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encodedNonce);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedNonce = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { nonce, hashedNonce };
}

export default function GoogleSignInButton({ oneTap = false, showButton = true }: { oneTap?: boolean; showButton?: boolean }) {
  const buttonRef = useRef<HTMLDivElement>(null);

  const initializeGSI = useCallback(async () => {
    try {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string;
      if (!clientId) {
        console.error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID env var");
        return;
      }

      const { nonce, hashedNonce } = await generateNonce();

      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential: string }) => {
          try {
            const { error } = await supabase.auth.signInWithIdToken({
              provider: "google",
              token: response.credential,
              nonce,
            });
            if (error) throw error;
            // Successful sign-in; you can redirect if needed
          } catch (e) {
            console.error("Supabase signInWithIdToken failed", e);
          }
        },
        nonce: hashedNonce,
        ux_mode: "popup",
        auto_select: false,
        use_fedcm_for_prompt: true,
      });

      if (showButton && buttonRef.current) {
        google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "signin_with",
          logo_alignment: "left",
        });
      }

      if (oneTap) {
        google.accounts.id.prompt();
      }
    } catch (err) {
      console.error("Failed to initialize Google Identity Services", err);
    }
  }, []);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        async
        onReady={initializeGSI}
      />
      {showButton ? (
        <div
          ref={buttonRef}
          aria-label="Sign in with Google"
          className="inline-flex"
        />
      ) : null}
    </>
  );
}


