// Lookups over the generated scripture navigation catalog (src/lib/generated/scriptureCatalog.json, written by
// scripts/generateScriptureData.mjs from the same bundles the reader uses). Pure, with no JSON import of its own,
// so it is testable under plain Node; scriptureCatalog.ts binds it to the generated file.

export type ScriptureChapterDelineation = "Chapter" | "Section";

export type RawCatalogBook = {
  book: string;
  title: string;
  label: string;
  longTitle: string | null;
  subtitle: string | null;
  shortTitle: string | null;
  chapterCount: number;
  verseCounts: number[];
};

export type RawCatalogVolume = {
  volume: string;
  title: string;
  longTitle: string | null;
  subtitle: string | null;
  shortTitle: string | null;
  bundlePath: string;
  bookCount: number;
  chapterCount: number;
  verseCount: number;
  chapterDelineation: string;
  books: RawCatalogBook[];
};

export type RawScriptureCatalog = {
  schema: number;
  version: string;
  volumes: RawCatalogVolume[];
};

export type CatalogBook = RawCatalogBook & {
  volume: string;
  chapterDelineation: ScriptureChapterDelineation;
};

export type CatalogVolume = Omit<RawCatalogVolume, "books" | "chapterDelineation"> & {
  chapterDelineation: ScriptureChapterDelineation;
  books: CatalogBook[];
};

/** The order the Library lists the volumes in (the dataset itself is in canonical source order). */
export const LIBRARY_VOLUME_ORDER = [
  "bookofmormon",
  "oldtestament",
  "newtestament",
  "doctrineandcovenants",
  "pearl",
] as const;

export type ScriptureCatalogIndex = {
  version: string;
  /** Every volume, in Library order. */
  volumes: CatalogVolume[];
  /** Every volume, in the dataset's own (manifest.json) order. */
  datasetVolumes: CatalogVolume[];
  getVolume(volume: string): CatalogVolume | null;
  getBooks(volume: string): CatalogBook[];
  getBook(volume: string, book: string): CatalogBook | null;
  /** Book slugs are unique across the dataset, so a bare slug identifies its volume. */
  findBook(book: string): CatalogBook | null;
  hasChapter(volume: string, book: string, chapter: number): boolean;
};

function toDelineation(value: string): ScriptureChapterDelineation {
  return value === "Section" ? "Section" : "Chapter";
}

export function createScriptureCatalogIndex(raw: RawScriptureCatalog): ScriptureCatalogIndex {
  const volumesById = new Map<string, CatalogVolume>();
  const booksByKey = new Map<string, CatalogBook>();
  const booksBySlug = new Map<string, CatalogBook>();

  for (const rawVolume of raw.volumes) {
    const chapterDelineation = toDelineation(rawVolume.chapterDelineation);
    const books = rawVolume.books.map((rawBook) => ({
      ...rawBook,
      volume: rawVolume.volume,
      chapterDelineation,
    }));
    volumesById.set(rawVolume.volume, { ...rawVolume, chapterDelineation, books });
    for (const book of books) {
      booksByKey.set(`${book.volume}:${book.book}`, book);
      if (!booksBySlug.has(book.book)) booksBySlug.set(book.book, book);
    }
  }

  const ordered = LIBRARY_VOLUME_ORDER.flatMap((id) => {
    const volume = volumesById.get(id);
    return volume ? [volume] : [];
  });
  const extras = Array.from(volumesById.values()).filter(
    (volume) => !(LIBRARY_VOLUME_ORDER as readonly string[]).includes(volume.volume)
  );
  const volumes = [...ordered, ...extras];

  return {
    version: raw.version,
    volumes,
    datasetVolumes: Array.from(volumesById.values()),
    getVolume: (volume) => volumesById.get(volume) ?? null,
    getBooks: (volume) => volumesById.get(volume)?.books ?? [],
    getBook: (volume, book) => booksByKey.get(`${volume}:${book}`) ?? null,
    findBook: (book) => booksBySlug.get(book) ?? null,
    hasChapter: (volume, book, chapter) => {
      const entry = booksByKey.get(`${volume}:${book}`);
      return !!entry && Number.isInteger(chapter) && chapter >= 1 && chapter <= entry.chapterCount;
    },
  };
}
