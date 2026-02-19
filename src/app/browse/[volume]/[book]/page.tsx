import Link from "next/link";
import Breadcrumbs from "@/components/Breadcrumbs";
import { fetchBook } from "@/lib/openscripture";
import { getBibleBookBySlug, isBibleVolume } from "@/lib/bibleCanon";

export default async function BookLanding({ params }: { params: Promise<{ volume: string; book: string }> }) {
  const { volume, book } = await params;
  const bibleBook = isBibleVolume(volume) ? getBibleBookBySlug(book) : undefined;
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
    : await fetchBook(volume, book);
  const chapters = bookData.chapters ?? [];
  const delineation = bookData.chapterDelineation || "Chapter";
  const volumeLabelMap: Record<string, string> = {
    bookofmormon: "Book of Mormon",
    oldtestament: "Old Testament",
    newtestament: "New Testament",
    doctrineandcovenants: "Doctrine and Covenants",
    pearl: "Pearl of Great Price",
  };
  const volumeLabel = volumeLabelMap[volume] || volume.replace(/-/g, " ");
  return (
    <section className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Browse", href: "/browse" },
          { label: volumeLabel, href: `/browse/${volume}` },
          { label: bookData.title || book.replace(/-/g, " ") },
        ]}
      />
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold capitalize">{bookData.title || book.replace(/-/g, " ")}</h1>
        {bookData.summary ? (
          <p className="text-foreground/80 text-sm max-w-3xl">{bookData.summary}</p>
        ) : null}
      </header>
      <ChapterCards volume={volume} book={book} chapters={chapters} delineation={delineation} />
    </section>
  );
}


function ChapterCards({ volume, book, chapters, delineation }: { volume: string; book: string; chapters: Array<{ _id: string; summary?: string }>; delineation: string }) {
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
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {chapters.map((c, idx) => {
            const n = idx + 1;
            const { preview, points } = extractSummary(c.summary);
            return (
              <li key={c._id}>
                <Link
                  href={`/browse/${volume}/${book}/${n}`}
                  className="block rounded-lg border surface-card p-4 hover:bg-[var(--surface-button-hover)]"
                  data-ripple
                >
                  <div className="font-medium">{delineation} {n}</div>
                  {preview ? (
                    <p className="text-sm text-foreground/80 mt-1">{preview}</p>
                  ) : null}
                  {points.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
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
