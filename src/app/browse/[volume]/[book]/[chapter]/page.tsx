import { fetchChapter } from "../../../../../lib/openscripture";
import ChapterReader from "@/components/ChapterReader";
import type { Crumb } from "@/components/Breadcrumbs";
import BibleTranslationToolbar from "@/components/BibleTranslationToolbar";
import { isBibleVolume, normalizeBibleTranslationId } from "@/lib/bibleCanon";

type Params = {
  params: Promise<{ volume: string; book: string; chapter: string }>;
  searchParams: Promise<{ translation?: string | string[]; compare?: string | string[] }>;
};

export default async function ChapterPage({ params, searchParams }: Params) {
  const { volume, book, chapter } = await params;
  const query = await searchParams;
  const bibleMode = isBibleVolume(volume);
  const translationParam = Array.isArray(query.translation) ? query.translation[0] : query.translation;
  const translation = bibleMode ? normalizeBibleTranslationId(translationParam) : undefined;
  const activeTranslation = translation ?? "kjv";
  const compareParams = Array.isArray(query.compare)
    ? query.compare
    : query.compare
      ? [query.compare]
      : [];
  const compareTranslations = bibleMode
    ? compareParams
        .map((value) => normalizeBibleTranslationId(value))
        .filter((id) => id.toLowerCase() !== activeTranslation.toLowerCase())
        .filter((id, index, list) => list.findIndex((item) => item.toLowerCase() === id.toLowerCase()) === index)
    : [];

  const data = await fetchChapter(volume, book, chapter, { translation: activeTranslation });
  const compareResults = await Promise.allSettled(
    compareTranslations.map((translationId) =>
      fetchChapter(volume, book, chapter, { translation: translationId })
    )
  );
  const compareData: Awaited<ReturnType<typeof fetchChapter>>[] = [];
  const translationNotices: string[] = [];
  if (bibleMode && (data.translation ?? "").toLowerCase() !== activeTranslation.toLowerCase()) {
    translationNotices.push(
      `Primary translation "${activeTranslation.toUpperCase()}" was unavailable, showing "${(data.translation ?? "kjv").toUpperCase()}" instead.`
    );
  }
  compareResults.forEach((result, index) => {
    const requested = compareTranslations[index];
    if (result.status === "fulfilled") {
      const actual = (result.value.translation ?? "").toLowerCase();
      if (requested && actual && actual !== requested.toLowerCase()) {
        translationNotices.push(
          `Compare translation "${requested.toUpperCase()}" was unavailable, showing "${actual.toUpperCase()}" instead.`
        );
      }
      compareData.push(result.value);
      return;
    }
    if (requested) {
      translationNotices.push(
        `Could not load compare translation "${requested.toUpperCase()}".`
      );
    }
  });
  const querySuffix = bibleMode
    ? (() => {
        const params = new URLSearchParams();
        params.set("translation", activeTranslation);
        compareTranslations.forEach((id) => params.append("compare", id));
        return `?${params.toString()}`;
      })()
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
      <ChapterReader
        volume={volume}
        book={book}
        chapter={Number(chapter)}
        verses={data.verses}
        reference={data.reference}
        breadcrumbs={breadcrumbs}
        translationControls={
          bibleMode ? (
            <BibleTranslationToolbar
              volume={volume}
              book={book}
              chapter={chapter}
              translation={activeTranslation}
              compare={compareTranslations}
            />
          ) : undefined
        }
        prevHref={prevHref}
        nextHref={nextHref}
        primaryTranslation={data.translation ?? activeTranslation}
        translationNotices={translationNotices}
        compareChapters={compareData.map((item) => ({
          translation: item.translation ?? "",
          verses: item.verses,
        }))}
      />
    </article>
  );
}


