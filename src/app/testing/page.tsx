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
      <header className="page-hero">
        <h1 className="page-title" aria-label="Help test Verse Together">
          Help test{" "}
          <span className="brand-wordmark whitespace-nowrap" aria-hidden="true">
            Verse<span>Together</span>
          </span>
        </h1>
      </header>
      <TesterSignupForm />
    </section>
  );
}
