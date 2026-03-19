import Link from "next/link";
import { redirect } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import ScriptureQuickNav from "@/components/ScriptureQuickNav";
import { fetchBook } from "@/lib/openscripture";
import { getBibleBookBySlug, isBibleVolume } from "@/lib/bibleCanon";
import {
  getScriptureVolumeLabel,
  normalizeScriptureVolume,
  toScriptureVolumeUrlSlug,
} from "@/lib/scriptureVolumes";

export default async function BookLanding({
  params,
  searchParams,
}: {
  params: Promise<{ volume: string; book: string }>;
  searchParams: Promise<{ lessonId?: string | string[] }>;
}) {
  const { volume, book } = await params;
  const query = await searchParams;
  const lessonId = Array.isArray(query.lessonId) ? query.lessonId[0] : query.lessonId;
  const lessonSuffix = lessonId ? `?lessonId=${encodeURIComponent(lessonId)}` : "";
  const canonicalVolume = normalizeScriptureVolume(volume);
  const volumeSlug = toScriptureVolumeUrlSlug(canonicalVolume);
  if (volume !== volumeSlug) {
    redirect(`/browse/${volumeSlug}/${book}${lessonSuffix}`);
  }

  const bibleBook = isBibleVolume(canonicalVolume) ? getBibleBookBySlug(book) : undefined;
  const bookData = bibleBook
    ? {
        _id: bibleBook.id,
        title: bibleBook.label,
        chapterDelineation: "Chapter",
        summary: undefined,
        chapters: Array.from({ length: bibleBook.chapters }, (_, index) => ({
          _id: `${bibleBook.id}-${index + 1}`,
        })),
      }
    : await fetchBook(canonicalVolume, book);
  const chapters = bookData.chapters ?? [];
  const delineation = bookData.chapterDelineation || "Chapter";
  const volumeLabel = getScriptureVolumeLabel(canonicalVolume);
  const bookLabel = bookData.title || book.replace(/-/g, " ");
  const duplicateVolumeBook = bookLabel.trim().toLowerCase() === volumeLabel.trim().toLowerCase();
  const compactNumberGrid = canonicalVolume === "doctrineandcovenants" && book === "doctrineandcovenants";
  const summaryPreview = bookData.summary
    ? bookData.summary.split("â€”")[0]?.trim() || bookData.summary
    : "";
  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <Breadcrumbs
          items={[
            { label: "Browse", href: lessonId ? `/browse?lessonId=${encodeURIComponent(lessonId)}` : "/browse" },
            ...(duplicateVolumeBook
              ? []
              : [
                  {
                    label: volumeLabel,
                    href: lessonId
                      ? `/browse/${volumeSlug}?lessonId=${encodeURIComponent(lessonId)}`
                      : `/browse/${volumeSlug}`,
                  },
                ]),
            { label: bookLabel },
          ]}
        />
        <ScriptureQuickNav currentVolume={canonicalVolume} currentBook={book} />
      </div>
      <header className="rounded-[1.75rem] border px-5 py-6 surface-card-strong sm:px-7 sm:py-8">
        <div className="space-y-4">
          {!duplicateVolumeBook ? (
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/45">
              {volumeLabel}
            </div>
          ) : null}
          <h1 className="text-[2rem] font-semibold leading-none tracking-[-0.03em] sm:text-[2.6rem]">
            {bookLabel}
          </h1>
          {summaryPreview ? (
            <p className="max-w-3xl text-base italic leading-8 text-foreground/70 sm:text-lg">
              "{summaryPreview}"
            </p>
          ) : null}
        </div>
      </header>
      <ChapterCards
        volume={volumeSlug}
        book={book}
        lessonId={lessonId ?? null}
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
  lessonId,
  chapters,
  delineation,
  compactNumberGrid,
}: {
  volume: string;
  book: string;
  lessonId: string | null;
  chapters: Array<{ _id: string; summary?: string }>;
  delineation: string;
  compactNumberGrid: boolean;
}) {
  function extractSummary(text?: string): { preview: string; points: string[] } {
    if (!text) return { preview: "", points: [] };
    const parts = text.split("—").map((p) => p.trim()).filter(Boolean);
    let preview = parts[0] || text;
    if (preview.length > 160) {
      preview = preview.slice(0, 157).trimEnd() + "…";
    }
    const points = parts.slice(1, 3).map((p) => (p.length > 80 ? p.slice(0, 77).trimEnd() + "…" : p));
    return { preview, points };
  }
  const lessonSuffix = lessonId ? `?lessonId=${encodeURIComponent(lessonId)}` : "";
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-lg font-medium">Select a chapter</h2>
        <div className="pb-0.5 text-xs font-medium uppercase tracking-[0.14em] text-foreground/45">
          {chapters.length} total
        </div>
      </div>
      {chapters.length === 0 ? (
        <p className="text-foreground/70 text-sm">No chapter list available.</p>
      ) : (
        <ul
          className={
            compactNumberGrid
              ? "grid grid-cols-4 gap-2.5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8"
              : "grid grid-cols-4 gap-2.5 sm:grid-cols-5 md:grid-cols-6"
          }
        >
          {chapters.map((c, idx) => {
            const n = idx + 1;
            const { preview, points } = extractSummary(c.summary);
            return (
              <li key={c._id}>
                <Link
                  href={`/browse/${volume}/${book}/${n}${lessonSuffix}`}
                  className="group flex aspect-square min-h-[4.2rem] flex-col justify-between rounded-[1rem] border p-2.5 transition-all duration-200 surface-card hover:bg-[var(--surface-button-hover)]"
                  aria-label={`${delineation} ${n}`}
                  data-tap
                >
                  {!compactNumberGrid && idx === 0 ? (
                    <div className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                      Start
                    </div>
                  ) : null}
                  <div className="flex flex-1 items-center justify-center text-center">
                    <div className="space-y-1">
                      <div className="text-xl font-semibold leading-none tracking-[-0.02em] text-foreground/88">
                        {n}
                      </div>
                      {!compactNumberGrid && preview ? (
                        <div className="line-clamp-2 text-[0.64rem] leading-4 text-foreground/55">
                          {preview}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {!compactNumberGrid && points.length > 0 ? (
                    <div className="text-[0.58rem] uppercase tracking-[0.12em] text-foreground/35">
                      {points[0]}
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
