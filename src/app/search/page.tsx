export default function SearchPage() {
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <div className="inline-flex rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-button)] px-3 py-1 text-xs font-medium tracking-[0.08em] uppercase text-foreground/70">
          Coming Soon
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Search Scriptures</h1>
        <p className="max-w-2xl text-foreground/72">
          The dedicated search experience is not built yet. This page will become the home for
          scripture, study note, and reference search.
        </p>
      </header>

      <div className="surface-card-strong rounded-[1.75rem] border p-5 sm:p-6">
        <div className="flex items-center gap-3 rounded-[1.2rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] px-4 py-3">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 text-foreground/55"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="5.5" />
            <path d="m15.2 15.2 4.3 4.3" />
          </svg>
          <span className="text-sm text-foreground/55">Search UI in progress</span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="surface-card rounded-[1.25rem] border p-4">
            <div className="text-sm font-medium">Scripture Search</div>
            <p className="mt-1 text-sm text-foreground/68">
              Find books, chapters, verses, and exact phrase matches.
            </p>
          </div>
          <div className="surface-card rounded-[1.25rem] border p-4">
            <div className="text-sm font-medium">Note Search</div>
            <p className="mt-1 text-sm text-foreground/68">
              Search your saved notes, tags, and folders from one place.
            </p>
          </div>
          <div className="surface-card rounded-[1.25rem] border p-4">
            <div className="text-sm font-medium">Study Tools</div>
            <p className="mt-1 text-sm text-foreground/68">
              Jump into dictionaries, references, and related study content.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
