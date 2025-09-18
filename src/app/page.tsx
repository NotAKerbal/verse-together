import Link from "next/link";
import Feed from "@/components/Feed";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function Home() {
  return (
    <section className="py-12 sm:py-20 space-y-12">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Share scriptures. Bear testimony. Learn together.
        </h1>
        <p className="mt-4 text-base sm:text-lg text-foreground/80">
          Find and share your favorite verses, write insights, and bear testimony.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/browse"
            className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Start browsing
          </Link>
        </div>
      </div>

      <Feed />
      {/* One Tap prompt only (no visible button) */}
      <div className="sr-only" aria-hidden>
        <GoogleSignInButton oneTap={true} showButton={false} />
      </div>
    </section>
  );
}
