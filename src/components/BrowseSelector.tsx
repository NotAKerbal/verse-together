"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import BrowseCard, { type BrowseCardImage } from "@/components/BrowseCard";
import { BrowseNavigationContext } from "@/components/BrowseLink";
import { useChapterNavigation } from "@/components/ChapterNavigation";
import { ChapterReaderShell } from "@/components/ChapterReaderChrome";
import SelectionHeader from "@/components/SelectionHeader";
import VolumeBookBrowser from "@/components/VolumeBookBrowser";
import ComeFollowMeCard from "@/features/comeFollowMe/ComeFollowMeCard";
import ChapterGrid from "@/features/plans/ChapterGrid";
import ContinueReadingCard from "@/features/plans/ContinueReadingCard";
import {
  buildBookView,
  buildLibraryVolumes,
  buildVolumeBooks,
  browseSelectionHref,
  chapterChromeForHref,
  parseBrowseSelection,
  singleChapterBookHref,
  toBookView,
  type BookView,
  type BookViewSource,
} from "@/lib/browseRoutes";
import { scriptureCatalog } from "@/lib/scriptureCatalog";
import { getScriptureVolumeLabel } from "@/lib/scriptureVolumes";

// Original generated scenery, with no people or figures; see docs/browse-art-provenance.md.
const VOLUME_ART: Record<string, BrowseCardImage> = {
  bookofmormon: { src: "/art/browse-bookofmormon.webp" },
  oldtestament: { src: "/art/browse-oldtestament.webp" },
  newtestament: { src: "/art/browse-newtestament.webp" },
  doctrineandcovenants: { src: "/art/browse-doctrineandcovenants.webp" },
  pearl: { src: "/art/browse-pearl.webp" },
};

const LIBRARY_VOLUMES = buildLibraryVolumes(scriptureCatalog);

function LibraryView() {
  return (
    <section className="page-shell browse-shell">
      <SelectionHeader title="Library" showLibrarySearch />
      {/* One grid: study cards first (hidden in simple mode), then the volumes. Continue Reading
          renders nothing without a saved position, so it never leaves a gap. */}
      <ul className="browse-grid browse-library">
        <ComeFollowMeCard className="simple-hide" />
        <ContinueReadingCard className="simple-hide" />
        <BrowseCard
          href="/notes"
          className="simple-hide"
          image={{ src: "/art/browse-notes.webp" }}
          eyebrow="Study journal"
          title="Notes"
          description="Your study notes"
        />
        {LIBRARY_VOLUMES.map((volume) => (
          <BrowseCard
            key={volume.id}
            href={volume.href}
            image={VOLUME_ART[volume.id]}
            eyebrow={`${volume.shortLabel}${volume.id !== "doctrineandcovenants" ? ` · ${volume.chapterCount} chapters` : ""}`}
            title={volume.label}
          />
        ))}
      </ul>
    </section>
  );
}

function VolumeView({ volume, volumeSlug }: { volume: string; volumeSlug: string }) {
  const books = useMemo(() => buildVolumeBooks(scriptureCatalog, volume), [volume]);
  return (
    <section className="page-shell">
      {books.length === 0 ? (
        <p className="panel-card rounded-[1.35rem] p-4 text-[color:var(--foreground-muted)]">No book list available for this volume yet.</p>
      ) : (
        <VolumeBookBrowser
          books={books}
          volumeLabel={getScriptureVolumeLabel(volume)}
          volumeSlug={volumeSlug}
          backHref="/browse"
        />
      )}
    </section>
  );
}

function BookSelectionView({ view }: { view: BookView }) {
  return (
    <section className="page-shell browse-shell">
      <SelectionHeader
        title={view.label}
        backHref={view.backHref}
        currentVolume={view.volumeSlug}
        currentBook={view.book}
      />
      <div className="flex items-baseline justify-between gap-3 px-1">
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-[color:var(--foreground-soft)]">
          {view.chapterCount} {view.delineation.toLowerCase()}{view.chapterCount === 1 ? "" : "s"}
        </p>
      </div>
      <ChapterGrid
        volume={view.volumeSlug}
        book={view.book}
        chapterCount={view.chapterCount}
        delineation={view.delineation}
        compact={view.compact}
      />
    </section>
  );
}

type Props = {
  /** A book the bundled catalog lacks, as the server loaded it for this URL. */
  fallbackBook?: BookViewSource;
};

/**
 * The Library's volume → book → chapter selection. Every view is drawn from the bundled catalog, so after
 * hydration choosing a volume or book is a history entry plus a re-render, never a server request. The URLs
 * are the canonical server routes, so reload, direct links, new tabs, and Back/Forward all land on the same view.
 */
export default function BrowseSelector({ fallbackBook }: Props) {
  const pathname = usePathname();
  const selection = parseBrowseSelection(pathname);
  const canonicalHref = selection ? browseSelectionHref(selection) : null;
  // A one-chapter book has no list to show: its URL (an old link, or a history entry) opens the chapter.
  const chapterHref =
    selection?.kind === "book" ? singleChapterBookHref(scriptureCatalog, selection.volume, selection.book) : null;
  const navigateToChapter = useChapterNavigation();
  const focusTitleRef = useRef(false);

  const navigate = useCallback((href: string) => {
    if (href === window.location.pathname) return;
    // Next.js keeps its router in sync with native pushState, so usePathname (and with it this view, the
    // navigation bars, and last-location tracking) follows; Back/Forward restore each entry the same way.
    window.history.pushState(null, "", href);
    focusTitleRef.current = true;
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    // Replacing the book URL keeps Back from returning to it (and from bouncing straight forward again).
    if (chapterHref) navigateToChapter(`${chapterHref}${window.location.search}${window.location.hash}`, { replace: true });
  }, [chapterHref, navigateToChapter]);

  useEffect(() => {
    // An alias URL (e.g. /browse/old-testament) shows its canonical view; give it the canonical URL too.
    if (!chapterHref && canonicalHref && pathname !== canonicalHref) {
      window.history.replaceState(null, "", `${canonicalHref}${window.location.search}${window.location.hash}`);
    }
  }, [pathname, canonicalHref, chapterHref]);

  useEffect(() => {
    // After an in-place navigation, move focus to the new view's title, as a page load would reset it.
    if (!focusTitleRef.current) return;
    focusTitleRef.current = false;
    document.querySelector<HTMLElement>("[data-browse-title]")?.focus({ preventScroll: true });
  }, [pathname]);

  let content: ReactNode = null;
  if (!selection) {
    // Not a selection URL (the router is moving on to a chapter); this view is about to unmount.
  } else if (chapterHref) {
    // Its chapter's page, until the navigation to it (started below) takes over.
    const chrome = chapterChromeForHref(scriptureCatalog, chapterHref);
    content = chrome ? <ChapterReaderShell chrome={chrome} /> : null;
  } else if (selection.kind === "library") {
    content = <LibraryView />;
  } else if (selection.kind === "volume") {
    content = <VolumeView volume={selection.volume} volumeSlug={selection.volumeSlug} />;
  } else {
    const view =
      buildBookView(scriptureCatalog, selection.volume, selection.book) ??
      (fallbackBook && fallbackBook.book === selection.book && fallbackBook.volume === selection.volume
        ? toBookView(fallbackBook)
        : toBookView({
            volume: selection.volume,
            book: selection.book,
            label: selection.book.replace(/-/g, " "),
            chapterCount: 0,
            chapterDelineation: "Chapter",
          }));
    content = <BookSelectionView view={view} />;
  }

  return <BrowseNavigationContext.Provider value={navigate}>{content}</BrowseNavigationContext.Provider>;
}
