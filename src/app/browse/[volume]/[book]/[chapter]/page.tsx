import { fetchChapter } from "../../../../../lib/openscripture";
import ChapterReader from "@/components/ChapterReader";
import type { Crumb } from "@/components/Breadcrumbs";

type Params = { params: { volume: string; book: string; chapter: string } };

export default async function ChapterPage({ params }: Params) {
  const { volume, book, chapter } = params;
  const data = await fetchChapter(volume, book, chapter);

  const currentChapter = Number(chapter);
  const prevHref = currentChapter > 1 ? `/browse/${volume}/${book}/${currentChapter - 1}` : undefined;
  const nextHref = `/browse/${volume}/${book}/${currentChapter + 1}`;

  const breadcrumbs: Crumb[] = [
    { label: "Browse", href: "/browse" },
    { label: volume.replace(/-/g, " "), href: `/browse/${volume}` },
    { label: book.replace(/-/g, " "), href: `/browse/${volume}/${book}` },
    { label: `Chapter ${chapter}` },
  ];

  return (
    <article className="space-y-6">
      <ChapterReader
        volume={volume}
        book={book}
        chapter={Number(chapter)}
        verses={data.verses}
        reference={data.reference}
        breadcrumbs={breadcrumbs}
        prevHref={prevHref}
        nextHref={nextHref}
      />
    </article>
  );
}


