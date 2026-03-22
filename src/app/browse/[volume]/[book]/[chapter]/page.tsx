import { fetchChapter } from "../../../../../lib/openscripture";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import ChapterReader from "@/components/ChapterReader";
import type { Crumb } from "@/components/Breadcrumbs";
import BibleTranslationToolbar from "@/components/BibleTranslationToolbar";
import { isBibleVolume, normalizeBibleTranslationId } from "@/lib/bibleCanon";
import {
  getScriptureVolumeLabel,
  normalizeScriptureVolume,
  toScriptureVolumeUrlSlug,
} from "@/lib/scriptureVolumes";

type Params = {
  params: Promise<{ volume: string; book: string; chapter: string }>;
  searchParams: Promise<{ translation?: string | string[]; compare?: string | string[]; lessonId?: string | string[] }>;
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
    const lessonId = Array.isArray(query.lessonId) ? query.lessonId[0] : query.lessonId;
    compareValues.forEach((value) => redirectParams.append("compare", value));
    if (lessonId) redirectParams.set("lessonId", lessonId);
    const redirectSuffix = redirectParams.toString() ? `?${redirectParams.toString()}` : "";
    redirect(`/browse/${volumeSlug}/${book}/${chapter}${redirectSuffix}`);
  }

  const bibleMode = isBibleVolume(canonicalVolume);
  const translationParam = Array.isArray(query.translation) ? query.translation[0] : query.translation;
  const requestedPrimaryOverlay = bibleMode && translationParam ? normalizeBibleTranslationId(translationParam) : undefined;
  const lessonId = Array.isArray(query.lessonId) ? query.lessonId[0] : query.lessonId;
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

  const headerList = await headers();
  const baseUrl = `${headerList.get("x-forwarded-proto") ?? "http"}://${headerList.get("host")}`;

  const data = await fetchChapter(canonicalVolume, book, chapter, { baseUrl });
  const compareResults = await Promise.allSettled(
    overlayTranslations.map((translationId) =>
      fetchChapter(canonicalVolume, book, chapter, { translation: translationId, baseUrl })
    )
  );
  const compareData: Awaited<ReturnType<typeof fetchChapter>>[] = [];
  const translationNotices: string[] = [];
  compareResults.forEach((result, index) => {
    const requested = overlayTranslations[index];
    if (result.status === "fulfilled") {
      const actual = (result.value.translation ?? "").toLowerCase();
      if (requested && actual && actual !== requested.toLowerCase()) {
        translationNotices.push(
          `Overlay translation "${requested.toUpperCase()}" was unavailable, showing "${actual.toUpperCase()}" instead.`
        );
      }
      compareData.push(result.value);
      return;
    }
    if (requested) {
      translationNotices.push(
        `Could not load overlay translation "${requested.toUpperCase()}".`
      );
    }
  });
  const querySuffix = bibleMode
    ? (() => {
        const params = new URLSearchParams();
        if (overlayTranslations[0]) params.set("translation", overlayTranslations[0]);
        overlayTranslations.slice(1).forEach((id) => params.append("compare", id));
        if (lessonId) params.set("lessonId", lessonId);
        const out = params.toString();
        return out ? `?${out}` : "";
      })()
    : (() => {
        const params = new URLSearchParams();
        if (lessonId) params.set("lessonId", lessonId);
        const out = params.toString();
        return out ? `?${out}` : "";
      })();

  const currentChapter = Number(chapter);
  const prevHref =
    currentChapter > 1 ? `/browse/${volumeSlug}/${book}/${currentChapter - 1}${querySuffix}` : undefined;
  const nextHref = `/browse/${volumeSlug}/${book}/${currentChapter + 1}${querySuffix}`;
  const volumeLabel = getScriptureVolumeLabel(canonicalVolume);
  const bookTitle = (data.reference || "").replace(/\s+\d+$/, "");
  const bookLabel = bookTitle || book.replace(/-/g, " ");
  const duplicateVolumeBook =
    bookLabel.trim().toLowerCase() === volumeLabel.trim().toLowerCase() ||
    (canonicalVolume === "doctrineandcovenants" && book === "doctrineandcovenants");

  const breadcrumbs: Crumb[] = [
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
    {
      label: bookLabel,
      href: lessonId
        ? `/browse/${volumeSlug}/${book}?lessonId=${encodeURIComponent(lessonId)}`
        : `/browse/${volumeSlug}/${book}`,
    },
    { label: `Chapter ${chapter}` },
  ];

  return (
    <article className="space-y-6">
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
        translationNotices={translationNotices}
        compareChapters={compareData.map((item) => ({
          translation: item.translation ?? "",
          verses: item.verses,
        }))}
      />
    </article>
  );
}
