import Link from "next/link";
import { redirect } from "next/navigation";
import SelectionHeader from "@/components/SelectionHeader";
import { fetchBook } from "@/lib/openscripture";
import { getLocalLdsBook } from "@/lib/ldsLocalData.server";
import {
  getScriptureVolumeLabel,
  normalizeScriptureVolume,
  toScriptureVolumeUrlSlug,
} from "@/lib/scriptureVolumes";

function summarize(text?: string, limit = 160): string {
  if (!text) return "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= limit) return collapsed;
  return `${collapsed.slice(0, limit - 3).trimEnd()}...`;
}

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
  const volumeLabel = getScriptureVolumeLabel(canonicalVolume);
  const bookLabel = bookData.title || book.replace(/-/g, " ");
  const duplicateVolumeBook = bookLabel.trim().toLowerCase() === volumeLabel.trim().toLowerCase();
  const compactNumberGrid = canonicalVolume === "doctrineandcovenants" && book === "doctrineandcovenants";
  const summaryPreview = summarize(bookData.summary, 180);
  const volumeHref = `/browse/${volumeSlug}`;

  return (
    <section className="space-y-6">
      <SelectionHeader
        title={bookLabel}
        eyebrow={duplicateVolumeBook ? undefined : volumeLabel}
        meta={`${chapters.length} ${delineation.toLowerCase()}${chapters.length === 1 ? "" : "s"}`}
        backHref={volumeHref}
      />
      {summaryPreview ? (
        <div className="rounded-[1.35rem] border px-4 py-4 text-sm leading-7 text-foreground/66 surface-card-soft sm:px-5">
          {summaryPreview}
        </div>
      ) : null}
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
        <p className="text-sm text-foreground/70">No chapter list available.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6">
          {chapters.map((chapter, index) => {
            const chapterNumber = index + 1;
            const referenceLabel = `${delineation} ${chapterNumber}`;

            return (
              <li key={chapter._id}>
                <Link
                  href={`/browse/${volume}/${book}/${chapterNumber}`}
                  className="group flex min-h-[5.5rem] flex-col items-center justify-center rounded-[1.1rem] border px-3 py-3 text-center transition-all duration-200 surface-card hover:bg-[var(--surface-button-hover)] sm:min-h-[6rem]"
                  aria-label={referenceLabel}
                  data-tap
                >
                  <div className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-foreground/42">
                    {delineation}
                  </div>
                  <div className="mt-1 text-[1.35rem] font-semibold leading-none tracking-[-0.03em] text-foreground sm:text-[1.55rem]">
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
