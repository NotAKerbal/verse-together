import { Marked } from "marked";
import { groupVerseRuns, parseVerseSpec } from "../src/lib/passageShare";
import { normalizeScriptureVolume } from "../src/lib/scriptureVolumes";
import { isSafeSourceHref, type NoteSource } from "./noteJournal";

type Chapter = { volume: string; book: string; chapter: number };
type VerseRange = { verseStart: number; verseEnd: number };
const markdown = new Marked({ gfm: false });
const bookKey = (book: string) => book.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Only real reader links with a verse fragment qualify, never chapter context or retained recovery blocks. */
export function scriptureLinksForChapter(body: string, source: NoteSource | null | undefined, chapter: Chapter): VerseRange[] {
  const refs: VerseRange[] = [];
  const seen = new Set<string>();
  function add(href: string, label: string, sourceRange?: NoteSource) {
    if (!isSafeSourceHref(href)) return;
    const match = /^\/browse\/([^/?#]+)\/([^/?#]+)\/(\d+)(?:\?[^#]*)?#v-([1-9]\d*)$/.exec(href);
    if (!match || normalizeScriptureVolume(match[1]) !== normalizeScriptureVolume(chapter.volume) ||
        bookKey(match[2]) !== bookKey(chapter.book) || Number(match[3]) !== chapter.chapter) return;
    const first = Number(match[4]);
    if (!Number.isSafeInteger(first)) return;
    let ranges: VerseRange[] = [{ verseStart: first, verseEnd: first }];
    // The generated label carries the range; old chapter-only labels still link to their exact first verse.
    const spec = /(\d+):([\d\s,–—-]+)$/.exec(label.trim());
    const verses = spec && Number(spec[1]) === chapter.chapter ? parseVerseSpec(spec[2], 999) : null;
    if (verses?.[0] === first) {
      ranges = groupVerseRuns(verses).map(({ start, end }) => ({ verseStart: start, verseEnd: end }));
    } else if (sourceRange?.kind === "scripture" && sourceRange.verseStart === first &&
        sourceRange.chapter === chapter.chapter && sourceRange.volume && sourceRange.book &&
        normalizeScriptureVolume(sourceRange.volume) === normalizeScriptureVolume(chapter.volume) &&
        bookKey(sourceRange.book) === bookKey(chapter.book)) {
      const end = sourceRange.verseEnd ?? first;
      if (Number.isSafeInteger(end) && end >= first) ranges = [{ verseStart: first, verseEnd: end }];
    }
    for (const range of ranges) {
      const key = `${range.verseStart}-${range.verseEnd}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(range);
    }
  }
  // The source is also shown as a clickable backlink outside the note body.
  if (source) add(source.href, source.label, source);
  markdown.walkTokens(markdown.lexer(body), (token) => {
    if (token.type === "link") add(token.href, token.text);
  });
  return refs;
}
