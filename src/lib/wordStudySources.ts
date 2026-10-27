import { getBibleBookBySlug, isBibleVolume, type BibleTestament } from "./bibleCanon";
import { normalizeScriptureVolume } from "./scriptureVolumes";

/** Where the selected word was read, so Explore can offer sources for that passage. */
export type WordStudyContext = { volume: string; book: string; chapter: number };

export type BiblicalLanguage = "hebrew" | "greek";

/** Bible Hub's lexicon search for an English word (a search, not a translation of the passage). */
export function bibleHubLexiconSearchUrl(language: BiblicalLanguage, word: string): string {
  const page = language === "hebrew" ? "searchhebrew.php" : "searchgreek.php";
  return `https://biblehub.net/${page}?q=${encodeURIComponent(word.trim())}`;
}

// Bible Hub's interlinear paths: numbered books use an underscore ("1_samuel") and the Song of Solomon is "songs".
function bibleHubBookPath(slug: string): string {
  if (slug === "songofsolomon") return "songs";
  return slug.replace(/^([1-3])(?=[a-z])/, "$1_");
}

export type BibleInterlinearLink = {
  url: string;
  /** "Genesis 1" */
  passage: string;
  testament: BibleTestament;
};

/** A word-by-word original-language view of the chapter, only for a real Old or New Testament chapter. */
export function getBibleInterlinearLink(context: WordStudyContext | null | undefined): BibleInterlinearLink | null {
  if (!context) return null;
  const volume = normalizeScriptureVolume(context.volume);
  if (!isBibleVolume(volume)) return null;
  const book = getBibleBookBySlug(context.book);
  if (!book || book.testament !== (volume === "oldtestament" ? "old" : "new")) return null;
  const { chapter } = context;
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) return null;
  return {
    url: `https://biblehub.com/interlinear/${bibleHubBookPath(book.slug)}/${chapter}.htm`,
    passage: `${book.label} ${chapter}`,
    testament: book.testament,
  };
}
