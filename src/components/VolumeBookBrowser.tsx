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
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
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
                className="panel-card interactive-card group flex h-full items-center gap-4 rounded-[1.4rem] px-4 py-4"
                data-tap
              >
                <div className="icon-chip inline-flex h-11 w-11 shrink-0 items-center justify-center text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--foreground-soft)]">
                  {(index + 1).toString().padStart(2, "0")}
                </div>
                <div className="min-w-0 flex-1">
                  {book.category ? (
                    <div className="mb-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-soft)]">
                      {book.category}
                    </div>
                  ) : null}
                  <div className="text-[1.1rem] font-semibold tracking-[-0.025em] text-foreground">
                    {book.label}
                  </div>
                  {book.chapters ? (
                    <div className="mt-1 text-sm text-[color:var(--foreground-muted)]">
                      {book.chapters} {book.chapters === 1 ? "chapter" : "chapters"}
                    </div>
                  ) : null}
                </div>
                <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--foreground-soft)] transition-transform duration-200 group-hover:translate-x-0.5">
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
