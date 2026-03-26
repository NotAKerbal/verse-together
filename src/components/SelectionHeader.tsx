import Link from "next/link";
import ScriptureQuickNav from "./ScriptureQuickNav";

type Props = {
  title: string;
  backHref?: string;
  currentVolume?: string;
  currentBook?: string;
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
}: Props) {
  return (
    <div className="browse-hero mobile-menu-clearance">
      <div className="flex min-h-[2.75rem] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              className="browse-header-button inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[color:var(--foreground-muted)]"
              aria-label="Go back"
              data-tap
            >
              <BackIcon />
            </Link>
          ) : null}
          <h1 className="browse-title min-w-0">{title}</h1>
        </div>
        <ScriptureQuickNav
          currentVolume={currentVolume}
          currentBook={currentBook}
          align="right"
          buttonClassName="browse-header-button h-9 w-9 rounded-xl"
        />
      </div>
    </div>
  );
}
