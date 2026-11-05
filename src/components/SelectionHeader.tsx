"use client";

import type { ReactNode } from "react";
import { AppHeaderPortal, useAppHeaderSlot } from "./AppHeaderSlot";
import BrowseLink from "./BrowseLink";
import { usePageCoveredByChapterNavigation } from "./ChapterNavigation";
import ReaderSearchButton from "./ReaderSearchButton";

type Props = {
  title: string;
  backHref?: string;
  pageDetail?: ReactNode;
};

type SelectionControlsProps = Pick<Props, "title" | "backHref"> & {
  titleIsHeading: boolean;
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

function SelectionControls({ title, backHref, titleIsHeading }: SelectionControlsProps) {
  return (
    <div className="app-header-selection" data-back={backHref ? "true" : undefined}>
      {backHref ? (
        <BrowseLink href={backHref} className="app-header-selection-button" aria-label="Go back" title="Go back" data-tap>
          <BackIcon />
        </BrowseLink>
      ) : null}
      {titleIsHeading ? (
        <h1 className="app-header-selection-title outline-none" tabIndex={-1} title={title} data-browse-title>
          {title}
        </h1>
      ) : (
        <p className="app-header-selection-title" title={title}>
          {title}
        </p>
      )}
      <ReaderSearchButton buttonClassName="simple-hide app-header-selection-button" />
    </div>
  );
}

export default function SelectionHeader({ title, backHref, pageDetail }: Props) {
  const { available } = useAppHeaderSlot();
  const covered = usePageCoveredByChapterNavigation();
  const inHeader = available && !covered;
  const hasPageIntro = pageDetail != null;
  return (
    <>
      <div className={`browse-selection-header${inHeader ? " browse-header-fallback" : ""}`}>
        <SelectionControls title={title} backHref={backHref} titleIsHeading />
      </div>
      {inHeader ? (
        <AppHeaderPortal>
          <SelectionControls title={title} backHref={backHref} titleIsHeading={!hasPageIntro} />
        </AppHeaderPortal>
      ) : null}
      {hasPageIntro ? (
        <div className="browse-page-intro">
          {inHeader ? (
            <h1 className="page-title browse-page-heading outline-none" tabIndex={-1} data-browse-title>
              {title}
            </h1>
          ) : null}
          {pageDetail}
        </div>
      ) : null}
    </>
  );
}
