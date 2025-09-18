"use client";

import Script from "next/script";
import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

type GsiCallbackResponse = { credential: string };
type GsiInitConfig = {
  client_id: string;
  callback: (response: GsiCallbackResponse) => void;
  ux_mode?: "popup" | "redirect";
  auto_select?: boolean;
  use_fedcm_for_prompt?: boolean;
  nonce?: string;
};
type GsiButtonOptions = {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  shape?: "pill" | "rectangular" | "circle" | "square";
  text?: string;
  logo_alignment?: "left" | "center";
};
type GoogleGsi = {
  accounts: {
    id: {
      initialize: (config: GsiInitConfig) => void;
      renderButton: (el: HTMLElement, options: GsiButtonOptions) => void;
      prompt: () => void;
    };
  };
};
declare const google: GoogleGsi;

async function generateNonce(): Promise<{ nonce?: string; hashedNonce?: string }> {
  try {
    if (typeof window === "undefined" || !window.crypto) {
      return {};
    }
    const random = new Uint8Array(32);
    window.crypto.getRandomValues(random);
    const nonce = btoa(String.fromCharCode(...Array.from(random)));
    // Some mobile browsers over HTTP do not support SubtleCrypto
    if (!window.crypto.subtle || typeof window.crypto.subtle.digest !== "function") {
      return { nonce };
    }
    const encoder = new TextEncoder();
    const encodedNonce = encoder.encode(nonce);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", encodedNonce);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return { nonce, hashedNonce };
  } catch {
    // Fallback: no nonce
    return {};
  }
}

export default function GoogleSignInButton({ oneTap = false, showButton = true }: { oneTap?: boolean; showButton?: boolean }) {
  const buttonRef = useRef<HTMLDivElement>(null);

  const initializeGSI = useCallback(() => {
    void (async () => {
      try {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string;
        if (!clientId) {
          console.error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID env var");
          return;
        }

        const { nonce, hashedNonce } = await generateNonce();

        const initConfig: GsiInitConfig = {
          client_id: clientId,
          callback: async (response: GsiCallbackResponse) => {
            try {
              const { error } = await supabase.auth.signInWithIdToken({
                provider: "google",
                token: response.credential,
                // nonce is optional for Google; only send when we have one
                nonce,
              });
              if (error) throw error;
              // Attempt to upsert the user's profile using Google-provided metadata
              try {
                const { data } = await supabase.auth.getUser();
                const user = data.user;
                if (user) {
                  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
                  const displayName =
                    (typeof metadata.name === "string" && metadata.name) ||
                    (typeof metadata.full_name === "string" && metadata.full_name) ||
                    (typeof metadata.given_name === "string" && metadata.given_name) ||
                    user.email?.split("@")[0] ||
                    "User";
                  const avatarUrl =
                    (typeof metadata.picture === "string" && metadata.picture) ||
                    (typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
                    null;
                  await supabase
                    .from("profiles")
                    .upsert(
                      { user_id: user.id, display_name: displayName, avatar_url: avatarUrl },
                      { onConflict: "user_id" }
                    );
                }
              } catch (e) {
                // profiles table might not exist or RLS may block; ignore silently
                console.warn("Profile upsert skipped:", e);
              }
            } catch (e) {
              console.error("Supabase signInWithIdToken failed", e);
            }
          },
          ux_mode: "popup",
          auto_select: false,
          use_fedcm_for_prompt: true,
        };
        if (hashedNonce) initConfig.nonce = hashedNonce;

        google.accounts.id.initialize(initConfig);

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
    })();
  }, [oneTap, showButton]);

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


