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
        <p className="panel-card rounded-[1.25rem] p-4 text-sm text-[color:var(--foreground-muted)]">No chapter list available.</p>
      ) : (
        <ul className="browse-chapter-grid" data-compact={compactNumberGrid ? "true" : "false"}>
          {chapters.map((chapter, index) => {
            const chapterNumber = index + 1;
            const referenceLabel = `${delineation} ${chapterNumber}`;

            return (
              <li key={chapter._id}>
                <Link
                  href={`/browse/${volume}/${book}/${chapterNumber}`}
                  className="panel-card interactive-card group flex min-h-[5.75rem] flex-col items-center justify-center rounded-[1.15rem] px-3 py-3 text-center sm:min-h-[6.1rem]"
                  aria-label={referenceLabel}
                  data-tap
                >
                  <div className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-soft)]">
                    {delineation}
                  </div>
                  <div className="mt-1 text-[1.55rem] font-semibold leading-none tracking-[-0.04em] text-foreground sm:text-[1.75rem]">
                    {chapterNumber}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
