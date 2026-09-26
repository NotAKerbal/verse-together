import Link from "next/link";
import SelectionHeader from "@/components/SelectionHeader";

export type VolumeBookBrowserItem = {
  id: string;
  label: string;
  chapters?: number;
  category?: string;
  subtitle?: string | null;
  titleOfficial?: string;
};

type Props = {
  books: VolumeBookBrowserItem[];
  volumeLabel: string;
  volumeSlug: string;
  backHref?: string;
};

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export default function VolumeBookBrowser({
  books,
  volumeLabel,
  volumeSlug,
  backHref,
}: Props) {
  return (
    <div className="page-shell browse-shell">
      <SelectionHeader
        title={volumeLabel}
        backHref={backHref}
        currentVolume={volumeSlug}
      />

      {books.length === 0 ? (
        <div className="browse-summary-card px-5 py-10 text-center text-sm text-[color:var(--foreground-muted)]">
          No books available.
        </div>
      ) : (
        <ul className="browse-grid">
          {books.map((book, index) => (
            <li key={book.id}>
              <Link
                href={`/browse/${volumeSlug}/${book.id}`}
                className="panel-card interactive-card group flex h-full items-center gap-4 px-4 py-4"
                data-tap
              >
                <div className="icon-chip h-11 w-11 shrink-0 text-[0.78rem] font-extrabold tracking-[0.02em]">
                  {(index + 1).toString().padStart(2, "0")}
                </div>
                <div className="min-w-0 flex-1">
                  {book.category ? (
                    <div className="mb-1 text-[0.64rem] font-bold uppercase tracking-[0.1em] text-[color:var(--foreground-soft)]">
                      {book.category}
                    </div>
                  ) : null}
                  <div className="font-display text-[1.2rem] font-bold leading-tight tracking-[-0.025em] text-foreground">
                    {book.label}
                  </div>
                  {book.chapters ? (
                    <div className="mt-0.5 text-[0.8rem] font-semibold text-[color:var(--foreground-muted)]">
                      {book.chapters} {book.chapters === 1 ? "chapter" : "chapters"}
                    </div>
                  ) : null}
                </div>
                <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] text-[color:var(--foreground)] transition-transform duration-150 group-hover:translate-x-0.5">
                  <ChevronIcon />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
