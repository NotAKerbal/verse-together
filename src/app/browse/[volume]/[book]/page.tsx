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

export default async function BookLanding({ params }: { params: Promise<{ volume: string; book: string }> }) {
  const { volume, book } = await params;
  const canonicalVolume = normalizeScriptureVolume(volume);
  const volumeSlug = toScriptureVolumeUrlSlug(canonicalVolume);
  if (volume !== volumeSlug) {
    redirect(`/browse/${volumeSlug}/${book}`);
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
  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <Breadcrumbs
          items={[
            { label: "Browse", href: "/browse" },
            ...(duplicateVolumeBook ? [] : [{ label: volumeLabel, href: `/browse/${volumeSlug}` }]),
            { label: bookLabel },
          ]}
        />
        <ScriptureQuickNav currentVolume={canonicalVolume} currentBook={book} />
      </div>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold capitalize">{bookLabel}</h1>
        {bookData.summary ? (
          <p className="text-foreground/80 text-sm max-w-3xl">{bookData.summary}</p>
        ) : null}
      </header>
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
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">Select a chapter</h2>
      {chapters.length === 0 ? (
        <p className="text-foreground/70 text-sm">No chapter list available.</p>
      ) : (
        <ul className={compactNumberGrid ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2" : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5"}>
          {chapters.map((c, idx) => {
            const n = idx + 1;
            const { preview, points } = extractSummary(c.summary);
            return (
              <li key={c._id}>
                <Link
                  href={`/browse/${volume}/${book}/${n}`}
                  className={compactNumberGrid ? "block rounded-lg border surface-card px-2 py-3 text-center hover:bg-[var(--surface-button-hover)]" : "block rounded-lg border surface-card p-3 hover:bg-[var(--surface-button-hover)]"}
                  aria-label={`${delineation} ${n}`}
                  data-ripple
                >
                  <div className={compactNumberGrid ? "text-base font-semibold" : "font-medium"}>
                    {compactNumberGrid ? n : `${delineation} ${n}`}
                  </div>
                  {!compactNumberGrid && preview ? (
                    <p className="text-xs text-foreground/80 mt-1">{preview}</p>
                  ) : null}
                  {!compactNumberGrid && points.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {points.map((p, i) => (
                        <span key={i} className="inline-flex items-center rounded-full border surface-button px-2 py-0.5 text-xs text-foreground/80">{p}</span>
                      ))}
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
