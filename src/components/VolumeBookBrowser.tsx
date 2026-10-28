import BrowseChevronIcon from "@/components/BrowseChevronIcon";
import Image from "next/image";
import BrowseLink from "@/components/BrowseLink";
import SelectionHeader from "@/components/SelectionHeader";
import { getScriptureBookArt } from "@/lib/scriptureBookArt";

export type VolumeBookBrowserItem = {
  id: string;
  label: string;
  chapters?: number;
  category?: string;
  subtitle?: string | null;
  titleOfficial?: string;
  /** Defaults to /browse/<volume>/<book>. */
  href?: string;
};

type Props = {
  books: VolumeBookBrowserItem[];
  volumeLabel: string;
  volumeSlug: string;
  backHref?: string;
};


export default function VolumeBookBrowser({
  books,
  volumeLabel,
  volumeSlug,
  backHref,
}: Props) {
  return (
    <div className="page-shell browse-shell">
      <SelectionHeader title={volumeLabel} backHref={backHref} />

      {books.length === 0 ? (
        <div className="browse-summary-card px-5 py-10 text-center text-sm text-[color:var(--foreground-muted)]">
          No books available.
        </div>
      ) : (
        <ul className="browse-grid">
          {books.map((book) => (
            <li key={book.id}>
              <BrowseLink
                href={book.href ?? `/browse/${volumeSlug}/${book.id}`}
                className="panel-card interactive-card group flex h-full items-center gap-4 px-4 py-4"
                data-tap
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[color:var(--surface-card-soft)] sm:h-20 sm:w-20">
                  <Image
                    src={getScriptureBookArt(volumeSlug, book.id)}
                    alt=""
                    width={80}
                    height={80}
                    className="h-full w-full object-cover"
                  />
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
                  <BrowseChevronIcon />
                </div>
              </BrowseLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
