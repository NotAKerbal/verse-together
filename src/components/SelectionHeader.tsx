"use client";

import { AppHeaderPortal, useAppHeaderSlot } from "./AppHeaderSlot";
import BrowseLink from "./BrowseLink";
import { usePageCoveredByChapterNavigation } from "./ChapterNavigation";
import ReaderSearchButton from "./ReaderSearchButton";

type Props = {
  title: string;
  backHref?: string;
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

function SelectionControls({ title, backHref }: Props) {
  return (
    <div className="app-header-selection" data-back={backHref ? "true" : undefined}>
      {backHref ? (
        <BrowseLink href={backHref} className="app-header-selection-button" aria-label="Go back" title="Go back" data-tap>
          <BackIcon />
        </BrowseLink>
      ) : null}
      <h1 className="app-header-selection-title outline-none" tabIndex={-1} title={title} data-browse-title>
        {title}
      </h1>
      <ReaderSearchButton buttonClassName="simple-hide app-header-selection-button" />
    </div>
  );
}

/**
 * A volume's or book's back link, title, and search (the Library's, in a popover). Wider screens show them at
 * the app header's right (rendered through a portal, so BrowseLink still switches views in place); phones, narrow
 * windows, simple mode, and the server-rendered page keep them in the page. CSS shows one copy at a time. While a
 * chapter opening from this page covers it, the header copy is unmounted, so it never outlives the page.
 */
export default function SelectionHeader({ title, backHref }: Props) {
  const { available } = useAppHeaderSlot();
  // The covered page stays mounted (hidden) so an abandoned navigation can return to it; its header controls
  // must not stay on screen over the chapter, and come back with the page.
  const covered = usePageCoveredByChapterNavigation();
  const inHeader = available && !covered;
  return (
    <>
      <div className={`browse-selection-header${inHeader ? " browse-header-fallback" : ""}`}>
        <SelectionControls title={title} backHref={backHref} />
      </div>
      {inHeader ? (
        <AppHeaderPortal>
          <SelectionControls title={title} backHref={backHref} />
        </AppHeaderPortal>
      ) : null}
    </>
  );
}
