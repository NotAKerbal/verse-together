"use client";

import { useEffect, useState } from "react";
import { sharePassageLink, type PassageShareOutcome } from "@/lib/passageShare";

const NOTICES: Partial<Record<PassageShareOutcome, string>> = {
  copied: "Link copied",
  failed: "Couldn't share · copy the address bar instead",
};

/**
 * Shares the focused passage: the system share sheet where there is one, otherwise the link is copied.
 * `href` is the passage's canonical share path, so every selected verse (gaps and all) goes with it.
 */
export default function SharePassageButton({ href, reference }: { href: string; reference: string }) {
  const [outcome, setOutcome] = useState<PassageShareOutcome | null>(null);
  const [pending, setPending] = useState(false);

  // "Link copied" fades back to the plain button; an error stays until the next try.
  useEffect(() => {
    if (outcome !== "copied") return;
    const timer = window.setTimeout(() => setOutcome(null), 2500);
    return () => window.clearTimeout(timer);
  }, [outcome]);

  async function share() {
    if (pending) return;
    setPending(true);
    setOutcome(null);
    const url = new URL(href, window.location.origin).toString();
    setOutcome(await sharePassageLink({ title: `${reference} · Verse Together`, text: reference, url }, navigator));
    setPending(false);
  }

  const notice = outcome ? NOTICES[outcome] : undefined;

  return (
    <span className="share-action">
      <button
        type="button"
        className="share-button"
        aria-label={`Share ${reference}`}
        aria-busy={pending || undefined}
        onClick={() => void share()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15V3" />
          <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
          <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
        </svg>
        Share
      </button>
      <span className="share-notice" role="status" data-outcome={outcome ?? undefined}>
        {notice}
      </span>
    </span>
  );
}
