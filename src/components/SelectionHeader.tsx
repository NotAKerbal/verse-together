import BrowseLink from "./BrowseLink";
import LibrarySearch from "./LibrarySearch";
import ScriptureQuickNav from "./ScriptureQuickNav";

type Props = {
  title: string;
  backHref?: string;
  currentVolume?: string;
  currentBook?: string;
  /**
   * Replace quick navigation with the Library's inline search box, which both jumps to references
   * and searches all scriptures (phones have no other way to /search).
   */
  showLibrarySearch?: boolean;
};

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export default function SelectionHeader({
  title,
  backHref,
  currentVolume,
  currentBook,
  showLibrarySearch = false,
}: Props) {
  return (
    <div className="browse-hero">
      <div className="flex min-h-[2.75rem] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {backHref ? (
            <BrowseLink
              href={backHref}
              className="browse-header-button inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[color:var(--foreground-muted)]"
              aria-label="Go back"
              data-tap
            >
              <BackIcon />
            </BrowseLink>
          ) : null}
          {/* Focus target after an in-place selection change (see BrowseSelector). */}
          <h1 className="browse-title min-w-0 outline-none" tabIndex={-1} data-browse-title>
            {title}
          </h1>
        </div>
        {showLibrarySearch ? (
          <LibrarySearch className="simple-hide max-w-[22rem] flex-1" />
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <ScriptureQuickNav
              currentVolume={currentVolume}
              currentBook={currentBook}
              align="right"
              buttonClassName="simple-hide browse-header-button h-9 w-9 rounded-xl"
            />
          </div>
        )}
      </div>
    </div>
  );
}
