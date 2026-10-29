"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

const inputClass = "mt-2 block w-full rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--input-surface)] px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-secondary)]";

export default function TesterSignupForm() {
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const android = platform === "android";
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    const form = new FormData(event.currentTarget);
    submitting.current = true;
    setPending(true);
    try {
      const response = await fetch("/api/tester-signups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"), email: form.get("email"), android, ios: !android,
          googlePlayEmail: android ? form.get("email") : "", device: "",
          consent: form.get("consent") === "on", website: form.get("website"),
        }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || "Your signup couldn’t be saved. Please try again.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your signup couldn’t be saved. Please try again.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <div className="panel-card rounded-2xl p-5 sm:p-7">
      {sent ? (
        <div role="status" className="space-y-3">
          <h2 className="text-xl font-semibold">You’re on the list!</h2>
          <p>{android ? "Thanks for helping shape Verse Together. We’ll email you an Android testing invitation with the next steps." : "You’re on the iOS waiting list. We’ll email you when it’s time to try Verse Together on your iPhone or iPad."}</p>
          <p className="text-sm text-[color:var(--foreground-muted)]">Your invitation and installation instructions will arrive separately.</p>
          <Link href="/browse" className="inline-block underline underline-offset-4">Explore Verse Together</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
          <h2 className="text-2xl font-semibold">Join the testing crew</h2>
          <fieldset disabled={pending} className="space-y-5 disabled:opacity-70">
            <fieldset>
              <legend className="font-medium">Which phone do you use?</legend>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {([ ["android", "Android"], ["ios", "iOS"] ] as const).map(([value, label]) => (
                  <label key={value} className="relative cursor-pointer">
                    <input type="radio" name="platform" value={value} checked={platform === value} onChange={() => setPlatform(value)} className="peer sr-only" />
                    <span className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-[color:var(--surface-border)] px-4 py-3 font-semibold transition-colors peer-checked:border-[color:var(--foreground)] peer-checked:bg-[color:var(--foreground)] peer-checked:text-[color:var(--background)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[color:var(--accent-secondary)]">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
              <p role="status" className="mt-3 text-sm text-[color:var(--foreground-muted)]">
                {android ? "Help us test Android. We’ll email you the next steps." : "iPhone or iPad? Join the waiting list for iOS testing."}
              </p>
            </fieldset>
            <div>
              <label htmlFor="tester-name" className="font-medium">Your name</label>
              <input id="tester-name" name="name" autoComplete="name" required maxLength={80} className={inputClass} />
            </div>
            <div>
              <label htmlFor="tester-email" className="font-medium">{android ? "Google Play email" : "Email address"}</label>
              <input id="tester-email" name="email" type="email" autoComplete="email" aria-describedby="tester-email-help" required maxLength={254} className={inputClass} />
              <p id="tester-email-help" className="mt-2 text-sm text-[color:var(--foreground-muted)]">
                {android ? "Use the Google account you use in the Play Store. We’ll send your invitation here, too." : "We’ll let you know when iOS testing is ready."}
              </p>
            </div>
            <div hidden aria-hidden="true">
              <label htmlFor="tester-website">Leave this blank</label>
              <input id="tester-website" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <label className="flex items-start gap-3 text-sm leading-relaxed">
              <input type="checkbox" name="consent" required className="mt-1 h-5 w-5 shrink-0" />
              <span>Email me testing invitations and updates. I can leave the list anytime.</span>
            </label>
            <p className="text-xs text-[color:var(--foreground-muted)]">Your details stay private and are used to manage testing. <Link href="/privacy#testing" className="underline underline-offset-2">Privacy &amp; leaving the list</Link></p>
          </fieldset>
          <p ref={errorRef} tabIndex={-1} role="alert" className={error ? "text-sm font-medium" : "sr-only"}>{error}</p>
          <button type="submit" disabled={pending} className="w-full rounded-full bg-[color:var(--foreground)] px-5 py-3 font-semibold text-[color:var(--background)] disabled:opacity-60">{pending ? "Saving…" : android ? "Count me in" : "Notify me about iOS"}</button>
        </form>
      )}
    </div>
  );
}
