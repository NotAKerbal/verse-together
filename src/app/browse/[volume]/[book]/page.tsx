import { redirect } from "next/navigation";
import SelectionHeader from "@/components/SelectionHeader";
import ChapterGrid from "@/features/plans/ChapterGrid";
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
      <ChapterGrid
        volume={volumeSlug}
        book={book}
        chapterCount={chapters.length}
        delineation={delineation}
        compact={compactNumberGrid}
      />
    </section>
  );
}
