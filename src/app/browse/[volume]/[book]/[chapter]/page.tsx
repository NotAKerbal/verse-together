import { fetchChapter } from "../../../../../lib/openscripture";
import Link from "next/link";
import ShareComposer from "../../../../../components/ShareComposer";

type Params = { params: { volume: string; book: string; chapter: string } };

export default async function ChapterPage({ params }: Params) {
  const { volume, book, chapter } = params;
  const data = await fetchChapter(volume, book, chapter);

  const currentChapter = Number(chapter);
  const prevHref = currentChapter > 1 ? `/browse/${volume}/${book}/${currentChapter - 1}` : undefined;
  const nextHref = `/browse/${volume}/${book}/${currentChapter + 1}`;

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{data.reference}</h1>
        <div className="flex items-center gap-2">
          {prevHref ? (
            <Link href={prevHref} className="text-sm underline underline-offset-4">
              Previous
            </Link>
          ) : (
            <span className="text-sm text-foreground/50">Previous</span>
          )}
          <span className="text-foreground/30">•</span>
          <Link href={nextHref} className="text-sm underline underline-offset-4">
            Next
          </Link>
        </div>
      </header>

      {Array.isArray(data.verses) && data.verses.length > 0 ? (
        <ol className="space-y-3">
          {data.verses.map((v) => (
            <li key={v.verse} className="leading-7">
              <span className="mr-2 text-foreground/60 text-sm align-top">{v.verse}</span>
              <span>{v.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-foreground/70">No verses found for this chapter.</p>
      )}

      <ShareComposer
        volume={volume}
        book={book}
        chapter={Number(chapter)}
        verses={data.verses}
        reference={data.reference}
      />
    </article>
  );
}


