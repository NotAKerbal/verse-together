// Chapter text from the bundled volumes, read lazily: a volume's bundle is parsed only when one of its chapters
// is first requested, and requests the catalog can rule out never read a bundle at all. Pure apart from the
// injected reader, so ldsLocalData.server.ts supplies the file system and tests supply a stub.

import type { CatalogVolume, ScriptureCatalogIndex } from "./scriptureCatalogIndex.ts";

export type LocalStoreChapter = {
  reference: string;
  translation?: string;
  verses: Array<{ verse: number; text: string }>;
};

export type LocalVolumeBundle = {
  books: Array<{
    book: string;
    chapters: Array<{ chapter: number; verses: Array<{ verse: number; text: string }> }>;
  }>;
};

export type LocalScriptureStore = {
  getChapter(volume: string, book: string, chapter: number): Promise<LocalStoreChapter | null>;
  /** Volumes whose bundle has been read (or is being read). */
  loadedVolumes(): string[];
};

export function createLocalScriptureStore(
  catalog: ScriptureCatalogIndex,
  readVolumeBundle: (volume: CatalogVolume) => Promise<LocalVolumeBundle>,
  translationFor: (volume: string) => string | undefined = () => undefined
): LocalScriptureStore {
  const chaptersByVolume = new Map<string, Promise<Map<string, LocalStoreChapter>>>();

  async function indexVolume(volume: CatalogVolume) {
    const bundle = await readVolumeBundle(volume);
    const translation = translationFor(volume.volume);
    const chapters = new Map<string, LocalStoreChapter>();
    for (const bundleBook of bundle.books) {
      const catalogBook = catalog.getBook(volume.volume, bundleBook.book);
      if (!catalogBook) continue;
      for (const bundleChapter of bundleBook.chapters) {
        chapters.set(`${catalogBook.book}:${bundleChapter.chapter}`, {
          reference: `${catalogBook.label} ${bundleChapter.chapter}`,
          translation,
          verses: bundleChapter.verses.map((verse) => ({ verse: verse.verse, text: verse.text })),
        });
      }
    }
    return chapters;
  }

  function volumeChapters(volume: CatalogVolume) {
    let pending = chaptersByVolume.get(volume.volume);
    if (!pending) {
      pending = indexVolume(volume);
      // A failed read is not kept, so a later request retries it.
      pending.catch(() => chaptersByVolume.delete(volume.volume));
      chaptersByVolume.set(volume.volume, pending);
    }
    return pending;
  }

  return {
    async getChapter(volume, book, chapter) {
      const volumeEntry = catalog.getVolume(volume);
      if (!volumeEntry || !catalog.hasChapter(volume, book, chapter)) return null;
      const chapters = await volumeChapters(volumeEntry);
      return chapters.get(`${book}:${chapter}`) ?? null;
    },
    loadedVolumes: () => Array.from(chaptersByVolume.keys()),
  };
}
