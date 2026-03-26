import Link from "next/link";
import SelectionHeader from "@/components/SelectionHeader";

export type VolumeBookBrowserItem = {
  id: string;
  label: string;
  chapters?: number;
  category?: string;
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6">
      <SelectionHeader title={volumeLabel} meta={`${books.length} books`} backHref={backHref} />

      {books.length === 0 ? (
        <div className="rounded-[1.5rem] border px-5 py-10 text-center text-sm surface-card-soft">
          No books available.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {books.map((book) => (
            <li key={book.id}>
              <Link
                href={`/browse/${volumeSlug}/${book.id}`}
                className="group flex h-full flex-col rounded-[1.35rem] border px-4 py-4 transition-all duration-200 surface-card"
                data-tap
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    {book.category ? (
                      <div className="mb-2 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-foreground/42">
                        {book.category}
                      </div>
                    ) : null}
                    <div className="text-[1.2rem] font-semibold leading-6 tracking-[-0.025em] text-foreground sm:text-[1.28rem]">
                      {book.label}
                    </div>
                  </div>
                  <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-foreground/34 transition-transform duration-200 group-hover:translate-x-0.5">
                    <ChevronIcon />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-xs font-medium uppercase tracking-[0.14em] text-foreground/46">
                  <span>{book.chapters ? `${book.chapters} ${book.chapters === 1 ? "chapter" : "chapters"}` : "Open"}</span>
                  <span>Open</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
