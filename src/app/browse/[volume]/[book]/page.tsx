import Link from "next/link";
import { redirect } from "next/navigation";
import SelectionHeader from "@/components/SelectionHeader";
import { fetchBook } from "@/lib/openscripture";
import { getLocalLdsBook } from "@/lib/ldsLocalData.server";
import {
  normalizeScriptureVolume,
  toScriptureVolumeUrlSlug,
} from "@/lib/scriptureVolumes";

export default async function BookLanding({
  params,
}: {
  params: Promise<{ volume: string; book: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { volume, book } = await params;
  const canonicalVolume = normalizeScriptureVolume(volume);
  const volumeSlug = toScriptureVolumeUrlSlug(canonicalVolume);

  if (volume !== volumeSlug) {
    redirect(`/browse/${volumeSlug}/${book}`);
  }

  const bookData = (await getLocalLdsBook(canonicalVolume, book)) ?? await fetchBook(canonicalVolume, book);

  const chapters = bookData.chapters ?? [];
  const delineation = bookData.chapterDelineation || "Chapter";
  const bookLabel = bookData.title || book.replace(/-/g, " ");
  const compactNumberGrid = canonicalVolume === "doctrineandcovenants" && book === "doctrineandcovenants";
  const volumeHref = `/browse/${volumeSlug}`;

  return (
    <section className="page-shell browse-shell">
      <SelectionHeader
        title={bookLabel}
        backHref={volumeHref}
        currentVolume={volumeSlug}
        currentBook={book}
      />
      <div className="flex items-baseline justify-between gap-3 px-1">
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-[color:var(--foreground-soft)]">
          {chapters.length} {delineation.toLowerCase()}{chapters.length === 1 ? "" : "s"}
        </p>
      </div>
      <ChapterCards
        volume={volumeSlug}
        book={book}
        chapters={chapters}
        delineation={delineation}
        compactNumberGrid={compactNumberGrid}
      />
    </section>
  );
}

function ChapterCards({
  volume,
  book,
  chapters,
  delineation,
  compactNumberGrid,
}: {
  volume: string;
  book: string;
  chapters: Array<{ _id: string; summary?: string }>;
  delineation: string;
  compactNumberGrid: boolean;
}) {
  return (
    <div>
      {chapters.length === 0 ? (
        <p className="panel-card p-4 text-sm text-[color:var(--foreground-muted)]">No chapter list available.</p>
      ) : (
        <ul className="browse-chapter-grid" data-compact={compactNumberGrid ? "true" : "false"}>
          {chapters.map((chapter, index) => {
            const chapterNumber = index + 1;
            const referenceLabel = `${delineation} ${chapterNumber}`;

            return (
              <li key={chapter._id}>
                <Link
                  href={`/browse/${volume}/${book}/${chapterNumber}`}
                  className="interactive-card group flex min-h-[3.4rem] items-center justify-center rounded-[0.85rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] px-2 py-2 text-center font-display text-[1.15rem] font-bold tracking-[-0.02em] text-foreground shadow-[var(--surface-shadow-soft)]"
                  aria-label={referenceLabel}
                  title={referenceLabel}
                  data-tap
                >
                  {chapterNumber}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
