import { redirect } from "next/navigation";
import ChapterReader from "@/components/ChapterReader";
import type { Crumb } from "@/components/Breadcrumbs";
import BibleTranslationToolbar from "@/components/BibleTranslationToolbar";
import { isBibleVolume, normalizeBibleTranslationId } from "@/lib/bibleCanon";
import { scriptureCatalog } from "@/lib/scriptureCatalog";
import { fetchChapterOnServer } from "@/lib/scriptureChapters.server";
import {
  getScriptureVolumeLabel,
  normalizeScriptureVolume,
  toScriptureVolumeUrlSlug,
} from "@/lib/scriptureVolumes";

type Params = {
  params: Promise<{ volume: string; book: string; chapter: string }>;
  searchParams: Promise<{ translation?: string | string[]; compare?: string | string[] }>;
};

export default async function ChapterPage({ params, searchParams }: Params) {
  const { volume, book, chapter } = await params;
  const query = await searchParams;
  const canonicalVolume = normalizeScriptureVolume(volume);
  const volumeSlug = toScriptureVolumeUrlSlug(canonicalVolume);
  if (volume !== volumeSlug) {
    const redirectParams = new URLSearchParams();
    const translation = Array.isArray(query.translation) ? query.translation[0] : query.translation;
    if (translation) {
      redirectParams.set("translation", translation);
    }
    const compareValues = Array.isArray(query.compare)
      ? query.compare
      : query.compare
        ? [query.compare]
        : [];
    compareValues.forEach((value) => redirectParams.append("compare", value));
    const redirectSuffix = redirectParams.toString() ? `?${redirectParams.toString()}` : "";
    redirect(`/browse/${volumeSlug}/${book}/${chapter}${redirectSuffix}`);
  }

  const bibleMode = isBibleVolume(canonicalVolume);
  const translationParam = Array.isArray(query.translation) ? query.translation[0] : query.translation;
  const requestedPrimaryOverlay = bibleMode && translationParam ? normalizeBibleTranslationId(translationParam) : undefined;
  const compareParams = Array.isArray(query.compare)
    ? query.compare
    : query.compare
      ? [query.compare]
      : [];
  const overlayTranslations = bibleMode
    ? [requestedPrimaryOverlay, ...compareParams]
        .filter((value): value is string => !!value)
        .map((value) => normalizeBibleTranslationId(value))
        .filter((id) => id.toLowerCase() !== "lds")
        .filter((id, index, list) => list.findIndex((item) => item.toLowerCase() === id.toLowerCase()) === index)
    : [];

  // Only the primary text is awaited here; comparison translations load in the reader once this has rendered,
  // so a slow or failing translation API never holds up the chapter.
  const data = await fetchChapterOnServer(canonicalVolume, book, chapter);
  const querySuffix = bibleMode
    ? (() => {
        const params = new URLSearchParams();
        if (overlayTranslations[0]) params.set("translation", overlayTranslations[0]);
        overlayTranslations.slice(1).forEach((id) => params.append("compare", id));
        const out = params.toString();
        return out ? `?${out}` : "";
      })()
    : "";

  const currentChapter = Number(chapter);
  const prevHref =
    currentChapter > 1 ? `/browse/${volumeSlug}/${book}/${currentChapter - 1}${querySuffix}` : undefined;
  const catalogBook = scriptureCatalog.getBook(canonicalVolume, book);
  const nextHref =
    catalogBook && currentChapter >= catalogBook.chapterCount
      ? undefined
      : `/browse/${volumeSlug}/${book}/${currentChapter + 1}${querySuffix}`;
  const volumeLabel = getScriptureVolumeLabel(canonicalVolume);
  const bookTitle = (data.reference || "").replace(/\s+\d+$/, "");
  const bookLabel = bookTitle || book.replace(/-/g, " ");
  const duplicateVolumeBook =
    bookLabel.trim().toLowerCase() === volumeLabel.trim().toLowerCase() ||
    (canonicalVolume === "doctrineandcovenants" && book === "doctrineandcovenants");

  const breadcrumbs: Crumb[] = [
    { label: "Browse", href: "/browse" },
    ...(duplicateVolumeBook
      ? []
      : [
          {
            label: volumeLabel,
            href: `/browse/${volumeSlug}`,
          },
        ]),
    {
      label: bookLabel,
      href: `/browse/${volumeSlug}/${book}`,
    },
    { label: `Chapter ${chapter}` },
  ];

  return (
    <article className="page-shell">
      <ChapterReader
        volume={volumeSlug}
        book={book}
        chapter={Number(chapter)}
        verses={data.verses}
        reference={data.reference}
        breadcrumbs={breadcrumbs}
        translationControls={
          bibleMode ? (
            <BibleTranslationToolbar
              volume={volumeSlug}
              book={book}
              chapter={chapter}
              compare={overlayTranslations}
            />
          ) : undefined
        }
        prevHref={prevHref}
        nextHref={nextHref}
        primaryTranslation={bibleMode ? "lds" : data.translation}
        overlayTranslations={overlayTranslations}
      />
    </article>
  );
}
