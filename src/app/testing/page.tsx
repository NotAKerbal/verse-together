import type { Metadata } from "next";
import TesterSignupForm from "./TesterSignupForm";

export const metadata: Metadata = {
  title: "Help test Verse Together",
  robots: { index: false, follow: false },
  description: "Volunteer to test Verse Together on Android, or join the waiting list for iOS testing.",
};

export default function TestingPage() {
  return (
    <section className="page-shell max-w-2xl py-4 sm:py-8">
      <header className="page-hero space-y-4">
        <div className="page-eyebrow">A little curiosity. A big difference.</div>
        <h1 className="page-title">Be part of what’s next.</h1>
        <p className="page-subtitle">Help bring Verse Together to your phone. Try new features, study your way, and tell us what you think.</p>
        <p className="text-sm font-medium text-[color:var(--accent-secondary)]">Your feedback helps shape the app.</p>
      </header>
      <TesterSignupForm />
      <p className="mt-5 text-center text-sm text-[color:var(--foreground-muted)]">No account needed. Just a phone and a little feedback.</p>
    </section>
  );
}
