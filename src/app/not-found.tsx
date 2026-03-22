import Link from "next/link";

function CompassIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.25" />
      <path d="m14.9 9.1-2.2 5.8-5.8 2.2 2.2-5.8 5.8-2.2Z" />
      <path d="m12.7 14.9-3.6-3.6" />
    </svg>
  );
}

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-5xl items-center py-8 sm:py-12">
      <div className="grid w-full gap-6 overflow-hidden rounded-[2rem] border p-5 surface-card-strong sm:grid-cols-[1.15fr_0.85fr] sm:p-8">
        <div className="relative overflow-hidden rounded-[1.7rem] border p-6 sm:p-8">
          <div
            className="absolute inset-0"
            aria-hidden="true"
            style={{
              background:
                "radial-gradient(circle at top left, color-mix(in oklab, var(--accent-primary) 22%, transparent), transparent 46%), radial-gradient(circle at bottom right, color-mix(in oklab, var(--accent-tertiary) 18%, transparent), transparent 48%), linear-gradient(180deg, color-mix(in oklab, var(--surface-card-strong) 92%, white 8%), var(--surface-card))",
            }}
          />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-foreground/68">
                <CompassIcon />
                Page not found
              </div>
              <div className="space-y-3">
                <p className="text-5xl font-semibold tracking-[-0.05em] sm:text-6xl">
                  404
                </p>
                <h1 className="max-w-xl text-2xl font-semibold tracking-[-0.03em] sm:text-4xl">
                  That passage is not in this chapter.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-foreground/72 sm:text-base">
                  The link may be outdated, incomplete, or pointing to a page that
                  has moved. You can jump back into browsing, search for a verse,
                  or return to the main library.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/browse"
                className="inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium"
                style={{
                  background: "var(--surface-button-active)",
                  color: "var(--surface-button-active-text)",
                }}
              >
                Go to Browse
              </Link>
              <Link
                href="/search"
                className="inline-flex items-center justify-center rounded-full border px-4 py-2.5 text-sm font-medium surface-button"
              >
                Search scriptures
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 rounded-[1.7rem] border p-5 surface-card sm:p-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/55">
              Quick ways back in
            </p>
            <div className="space-y-3">
              <Link
                href="/"
                className="block rounded-[1.2rem] border px-4 py-3 surface-button"
              >
                <span className="block text-sm font-medium">Home</span>
                <span className="block text-sm text-foreground/65">
                  Return to the main entry point.
                </span>
              </Link>
              <Link
                href="/feed"
                className="block rounded-[1.2rem] border px-4 py-3 surface-button"
              >
                <span className="block text-sm font-medium">Notes feed</span>
                <span className="block text-sm text-foreground/65">
                  Open recent notes and shared reflections.
                </span>
              </Link>
              <Link
                href="/help"
                className="block rounded-[1.2rem] border px-4 py-3 surface-button"
              >
                <span className="block text-sm font-medium">Help</span>
                <span className="block text-sm text-foreground/65">
                  See navigation tips and supported sections.
                </span>
              </Link>
            </div>
          </div>

          <div className="rounded-[1.3rem] border p-4 surface-card-soft">
            <p className="text-sm font-medium">If this came from a shared link</p>
            <p className="mt-1 text-sm leading-6 text-foreground/68">
              The note, lesson, or passage may no longer exist at that address.
              Start from Browse or Search and navigate back to the closest match.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
