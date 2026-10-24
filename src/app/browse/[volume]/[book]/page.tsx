import { redirect } from "next/navigation";
import BrowseSelector from "@/components/BrowseSelector";
import { singleChapterBookHref, toSearchSuffix } from "@/lib/browseRoutes";
import { fetchBook } from "@/lib/openscripture";
import { scriptureCatalog } from "@/lib/scriptureCatalog";
import {
  normalizeScriptureVolume,
  toScriptureVolumeUrlSlug,
} from "@/lib/scriptureVolumes";

export default async function BookLanding({
  params,
  searchParams,
}: {
  params: Promise<{ volume: string; book: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { volume, book } = await params;
  const canonicalVolume = normalizeScriptureVolume(volume);
  const volumeSlug = toScriptureVolumeUrlSlug(canonicalVolume);

  // A one-chapter book opens its chapter (on its canonical URL, in one redirect, keeping the query; the browser
  // keeps any #fragment across the redirect).
  const chapterHref = singleChapterBookHref(scriptureCatalog, canonicalVolume, book);
  if (chapterHref) {
    redirect(`${chapterHref}${toSearchSuffix(await searchParams)}`);
  }

  if (volume !== volumeSlug) {
    redirect(`/browse/${volumeSlug}/${book}`);
  }

  if (scriptureCatalog.getBook(canonicalVolume, book)) {
    return <BrowseSelector />;
  }

  // Not in the bundled catalog: ask the scripture API, as before, and hand the result to the selector.
  const bookData = await fetchBook(canonicalVolume, book);
  return (
    <BrowseSelector
      fallbackBook={{
        volume: canonicalVolume,
        book,
        label: bookData.title || book.replace(/-/g, " "),
        chapterCount: bookData.chapters?.length ?? 0,
        chapterDelineation: bookData.chapterDelineation || "Chapter",
      }}
    />
  );
}
