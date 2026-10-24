// Binds the bundled-text reader to fetchChapter for server code, with the volume canonicalized first so alias
// slugs ("dnc", "old-testament", "new-testament") hit the bundled copy instead of the remote cache or fallbacks.
// Pure (both dependencies injected), so scriptureChapters.server.ts supplies the real ones and tests a stub.

import type { ChapterFetchOptions, ChapterResponse, LocalChapterLoader } from "./openscripture.ts";
import { normalizeScriptureVolume } from "./scriptureVolumes.ts";

type FetchChapter = (
  volume: string,
  book: string,
  chapter: string | number,
  options?: ChapterFetchOptions
) => Promise<ChapterResponse>;

export function createServerChapterFetcher(fetchChapter: FetchChapter, loadLocalChapter: LocalChapterLoader) {
  return async function fetchChapterOnServer(
    volume: string,
    book: string,
    chapter: string | number,
    options: { translation?: string } = {}
  ): Promise<ChapterResponse> {
    return await fetchChapter(normalizeScriptureVolume(volume.trim()), book, chapter, {
      ...options,
      loadLocalChapter,
    });
  };
}
