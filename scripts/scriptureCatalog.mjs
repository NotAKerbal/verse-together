// Builds the small scripture navigation catalog (volumes, books, chapter and verse counts) from the same volume
// bundle payloads generateScriptureData.mjs writes to public/scripture-data. Navigation, browse, and lookups read
// this catalog instead of parsing the verse bundles, so it must be regenerated whenever the bundles are.

import { readFileSync } from "node:fs";
import path from "node:path";

export const CATALOG_SCHEMA_VERSION = 1;

/** "Joseph Smith--Matthew" is the dataset title; the app labels it "Joseph Smith-Matthew". */
export function catalogBookLabel(title) {
  return String(title ?? "").replace(/--/g, "-");
}

/**
 * @param {{ version: string, volumeBundles: Array<{ volume: object, books: Array<object> }> }} input
 *   Volume bundle payloads, in manifest order.
 */
export function buildScriptureCatalog({ version, volumeBundles }) {
  return {
    schema: CATALOG_SCHEMA_VERSION,
    version,
    volumes: volumeBundles.map((bundle) => {
      const volume = bundle.volume;
      const chapterDelineation = volume.volume === "doctrineandcovenants" ? "Section" : "Chapter";
      return {
        volume: volume.volume,
        title: volume.title,
        longTitle: volume.longTitle ?? null,
        subtitle: volume.subtitle ?? null,
        shortTitle: volume.shortTitle ?? null,
        bundlePath: volume.bundlePath,
        bookCount: volume.bookCount,
        chapterCount: volume.chapterCount,
        verseCount: volume.verseCount,
        chapterDelineation,
        books: bundle.books.map((book) => {
          const chapters = [...book.chapters].sort((left, right) => left.chapter - right.chapter);
          return {
            book: book.book,
            title: book.title,
            label: catalogBookLabel(book.title),
            longTitle: book.longTitle ?? null,
            subtitle: book.subtitle ?? null,
            shortTitle: book.shortTitle ?? null,
            chapterCount: book.chapterCount,
            verseCounts: chapters.map((chapter) => chapter.verses.length),
          };
        }),
      };
    }),
  };
}

/** Rebuilds the catalog from bundles already on disk (used by --catalog-only and by the consistency test). */
export function buildScriptureCatalogFromDirectory(dataDir) {
  const manifest = JSON.parse(readFileSync(path.join(dataDir, "manifest.json"), "utf8"));
  const volumeBundles = manifest.volumes.map((volume) =>
    JSON.parse(readFileSync(path.join(dataDir, path.basename(volume.bundlePath)), "utf8"))
  );
  return buildScriptureCatalog({ version: manifest.version, volumeBundles });
}

export function serializeScriptureCatalog(catalog) {
  return `${JSON.stringify(catalog)}\n`;
}
