// The chapter reader's placeholder while a chapter loads: the reader's header and column, with bars where the
// verses go. Shared by the chapter route's loading boundary and by in-app chapter navigation, so both look the same.

// Varied line lengths read as text rather than a grid of blocks.
const VERSE_LINES: number[][] = [
  [100, 96, 58],
  [100, 72],
  [100, 100, 88, 40],
  [100, 84],
  [100, 92, 66],
  [100, 54],
  [100, 98, 76],
  [100, 80, 30],
];

function Bar({ width }: { width: number }) {
  return <span className="block h-[0.8em] rounded-full bg-foreground/10" style={{ width: `${width}%` }} />;
}

export default function ChapterReaderSkeleton({ reference }: { reference?: string | null }) {
  const status = reference ? `Loading ${reference}…` : "Loading chapter…";
  return (
    <article className="page-shell">
      <section className="space-y-4 pb-20" role="status" aria-live="polite" data-chapter-skeleton>
        <span className="sr-only">{status}</span>
        <div className="reader-column relative mx-auto w-full max-w-6xl" aria-hidden="true">
          <header className="simple-hide sticky top-2 z-20">
            <div className="panel-card-strong relative flex flex-col gap-1 rounded-[1.15rem] px-3 py-2 sm:px-4">
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2 pl-0.5 sm:gap-3 sm:pl-1">
                  <span className="h-8 w-8 shrink-0 rounded-lg border surface-card-soft" />
                  <span className="inline-flex h-8 min-w-0 max-w-full flex-1 items-center rounded-lg border surface-card-soft px-2 text-xs sm:h-auto sm:flex-none sm:px-2.5 sm:py-1 sm:text-sm">
                    {reference ? (
                      <span className="truncate font-semibold text-foreground/70">{reference}</span>
                    ) : (
                      <span className="block h-[0.8em] w-24 rounded-full bg-foreground/10 motion-safe:animate-pulse" />
                    )}
                  </span>
                </div>
                <span className="h-8 w-8 shrink-0 rounded-lg border surface-card-soft" />
                <span className="h-8 w-8 shrink-0 rounded-lg border surface-card-soft" />
              </div>
            </div>
          </header>

          {reference ? <h1 className="simple-only reader-simple-title">{reference}</h1> : null}

          <ol className="space-y-2 font-serif motion-safe:animate-pulse sm:space-y-3">
            {VERSE_LINES.map((lines, index) => (
              <li key={index} className="-mx-2 my-2 rounded-md px-3 py-2 leading-7">
                <div className="flex flex-col gap-[0.65em] py-[0.35em]">
                  {lines.map((width, line) => (
                    <Bar key={line} width={width} />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </article>
  );
}
