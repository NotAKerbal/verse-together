import { redirect } from "next/navigation";
import ChapterReader from "@/components/ChapterReader";
import BibleTranslationToolbar from "@/components/BibleTranslationToolbar";
import { isBibleVolume } from "@/lib/bibleCanon";
import { buildChapterChrome, chapterOverlayTranslations } from "@/lib/browseRoutes";
import { scriptureCatalog } from "@/lib/scriptureCatalog";
import { fetchChapterOnServer } from "@/lib/scriptureChapters.server";
import { normalizeScriptureVolume, toScriptureVolumeUrlSlug } from "@/lib/scriptureVolumes";

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
  const overlayTranslations = chapterOverlayTranslations(canonicalVolume, query);
  const chrome = buildChapterChrome(scriptureCatalog, { volume: canonicalVolume, book, chapter: Number(chapter) }, overlayTranslations);

  // Nothing here waits for the text: the page (header, breadcrumbs, links) streams at once, so a navigation commits
  // as soon as the response starts, and the text follows as a promise the reader fades in when it resolves. Only
  // the primary text comes from here; comparison translations load in the reader after it.
  const content = fetchChapterOnServer(canonicalVolume, book, chapter);

  return (
    <article className="page-shell">
      <ChapterReader
        chrome={chrome}
        content={content}
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
        primaryTranslation={bibleMode ? "lds" : undefined}
        overlayTranslations={overlayTranslations}
      />
    </article>
  );
}
