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

  const volumeLabelMap: Record<string, string> = {
    bookofmormon: "Book of Mormon",
    oldtestament: "Old Testament",
    newtestament: "New Testament",
    doctrineandcovenants: "Doctrine and Covenants",
    pearl: "Pearl of Great Price",
  };
  const volumeLabel = volumeLabelMap[volume] || volume.replace(/-/g, " ");
  const bookTitle = (data.reference || "").replace(/\s+\d+$/, "");

  const breadcrumbs: Crumb[] = [
    { label: "Browse", href: "/browse" },
    { label: volumeLabel, href: `/browse/${volume}` },
    { label: bookTitle || book.replace(/-/g, " "), href: `/browse/${volume}/${book}` },
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


