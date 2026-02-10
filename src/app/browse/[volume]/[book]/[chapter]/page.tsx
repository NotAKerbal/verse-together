import { fetchChapter } from "../../../../../lib/openscripture";
import ChapterReader from "@/components/ChapterReader";
import type { Crumb } from "@/components/Breadcrumbs";
import BibleTranslationToolbar from "@/components/BibleTranslationToolbar";
import { isBibleVolume, normalizeBibleTranslationId } from "@/lib/bibleCanon";

type Params = {
  params: Promise<{ volume: string; book: string; chapter: string }>;
  searchParams: Promise<{ translation?: string; compare?: string }>;
};

export default async function ChapterPage({ params, searchParams }: Params) {
  const { volume, book, chapter } = await params;
  const query = await searchParams;
  const bibleMode = isBibleVolume(volume);
  const translation = bibleMode ? normalizeBibleTranslationId(query.translation) : undefined;
  const compareTranslation = bibleMode && query.compare ? normalizeBibleTranslationId(query.compare) : undefined;
  const data = await fetchChapter(volume, book, chapter, { translation });
  const compareData =
    bibleMode && compareTranslation && compareTranslation !== translation
      ? await fetchChapter(volume, book, chapter, { translation: compareTranslation })
      : null;
  const querySuffix = bibleMode
    ? `?translation=${translation ?? "kjv"}${compareTranslation ? `&compare=${compareTranslation}` : ""}`
    : "";

  const currentChapter = Number(chapter);
  const prevHref =
    currentChapter > 1 ? `/browse/${volume}/${book}/${currentChapter - 1}${querySuffix}` : undefined;
  const nextHref = `/browse/${volume}/${book}/${currentChapter + 1}${querySuffix}`;

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
      {bibleMode ? (
        <BibleTranslationToolbar
          volume={volume}
          book={book}
          chapter={chapter}
          translation={translation ?? "kjv"}
          compare={compareTranslation}
        />
      ) : null}
      <ChapterReader
        volume={volume}
        book={book}
        chapter={Number(chapter)}
        verses={data.verses}
        reference={data.reference}
        breadcrumbs={breadcrumbs}
        prevHref={prevHref}
        nextHref={nextHref}
        compareTranslation={compareData?.translation}
        compareVerses={compareData?.verses}
      />
    </article>
  );
}


