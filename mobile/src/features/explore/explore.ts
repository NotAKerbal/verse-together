// Explore (the web's WordStudyPanel and WordStudySources) for the exact selected text: study helps topics from the
// Bible Dictionary, Guide to the Scriptures and Topical Guide; Strong's Hebrew and Greek entries and the chapter's
// interlinear; and English dictionary entries and word histories. Topic matching runs on the device over the web's
// committed topic index (so it works offline); entry text, lexicon and dictionary results come from the Verse
// Together site's public API, the same endpoints and response shapes the web panel reads.

import studyHelpsIndex from "@/lib/generated/studyHelpsIndex.json";
import { sectionStatus, type SourceStatus } from "@/lib/exploreSources";
import { createSharedRequests } from "@/lib/sharedRequests";
import type { StrongsLanguage, StrongsLookup } from "@/lib/strongsLexicon";
import type { StudyHelpBlock, StudyHelpEntry, StudyHelpInline } from "@/lib/studyHelpContent";
import {
  findStudyHelpMatches,
  normalizeStudyTerm,
  STUDY_HELP_GUIDES,
  studyHelpBrowseUrl,
  type StudyHelpGuide,
  type StudyHelpGuideId,
  type StudyHelpMatches,
  type StudyHelpsIndex,
} from "@/lib/studyHelps";
import { bibleHubLexiconSearchUrl, getBibleInterlinearLink, type BibleInterlinearLink, type BiblicalLanguage, type WordStudyContext } from "@/lib/wordStudySources";
import type { Block, Run } from "../../cfm/guideTypes";
import { toAppHref, WEB_ORIGIN } from "../../navigation/hrefs";
import { getJson, NetworkError } from "./network";

export { STUDY_HELP_GUIDES, type StudyHelpGuideId };

const INDEX = studyHelpsIndex as StudyHelpsIndex;

// ---- The selection ----

const EDGE_PUNCTUATION = /^[\s"'“”‘’()[\]{},.;:!?—–-]+|[\s"'“”‘’()[\]{},.;:!?—–-]+$/g;

/** The selection as shown, preserving its punctuation and internal whitespace. */
export function explorePhrase(text: string): string {
  return text.trim();
}

/** The phrase as the sources look it up (the web lowercases the selected word the same way). Never truncated. */
export function exploreTerm(text: string): string {
  return text.replace(/\s+/g, " ").replace(EDGE_PUNCTUATION, "").trim().toLowerCase();
}

const STOPWORDS = new Set(
  "a an and are as at be but by did do for from had has have he her him his i in is it me my not o of on or our shall she that the thee their them they thou thy to unto us was we were which who will with ye you your also all came come even hath into let may more now said say so than then there these this those thus upon what when whom yea".split(" ")
);

/** The words of the selected text worth exploring one at a time: each once, in reading order, without the commonest. */
export function exploreWords(text: string, limit = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.replace(/--|—/g, " ").split(/[^A-Za-z’']+/)) {
    const word = raw.replace(/^['’]+|['’]+$/g, "").replace(/['’]s$/i, "");
    const key = word.toLowerCase();
    if (key.length < 3 || STOPWORDS.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= limit) break;
  }
  return out;
}

// ---- Requests, shared by key and kept for the session (failures are never kept, so Try again retries) ----

export type DictionaryEdition = "1828" | "1844" | "1913";
export type DictionaryEntry = { id: string; edition: DictionaryEdition; word: string; heading: string | null; entryText: string; pronounce: string | null };
export type EtymologyItem = { id: string; source: string; word: string; text: string };
export type DictionaryPayload = {
  ok: boolean;
  enabled: boolean;
  term?: string;
  byEdition?: Partial<Record<DictionaryEdition, { matchedKey?: string; entries: DictionaryEntry[] } | null>>;
  providerLabels?: Partial<Record<DictionaryEdition, string>>;
  etymology?: { items: EtymologyItem[] };
};

export const EDITIONS: DictionaryEdition[] = ["1828", "1844", "1913"];

export function lookupDictionary(term: string, signal?: AbortSignal): Promise<DictionaryPayload> {
  return getJson<DictionaryPayload>(`${WEB_ORIGIN}/api/tools/dictionary?term=${encodeURIComponent(term)}`, 15000, signal).then((payload) => {
    // The web panel treats a disabled or failed lookup as an error to retry, never as "no entries".
    if (!payload?.ok || !payload.enabled) throw new NetworkError("The dictionary isn't available right now. Try again.", "format");
    return payload;
  });
}

export async function lookupStudyHelp(guide: StudyHelpGuideId, slug: string, signal?: AbortSignal): Promise<StudyHelpEntry> {
  const params = `guide=${guide}&slug=${encodeURIComponent(slug)}`;
  const body = await getJson<{ ok: boolean; entry?: StudyHelpEntry; error?: string }>(`${WEB_ORIGIN}/api/tools/study-helps?${params}`, 15000, signal);
  if (!body.ok || !body.entry) throw new NetworkError(body.error ?? "The entry could not be loaded.", "format");
  return body.entry;
}

/** The lexicon API's longest term; a longer selection isn't looked up in Strong's. */
export const LEXICON_MAX_TERM = 64;

export async function lookupLexicon(language: StrongsLanguage, term: string, signal?: AbortSignal): Promise<StrongsLookup> {
  const params = `language=${language}&term=${encodeURIComponent(term)}`;
  const body = await getJson<{ ok: boolean; lookup?: StrongsLookup; error?: string }>(`${WEB_ORIGIN}/api/tools/lexicon?${params}`, 15000, signal);
  if (!body.ok || !body.lookup) throw new NetworkError(body.error ?? "The lexicon could not be read.", "format");
  return body.lookup;
}

export const dictionaryLookups = createSharedRequests<DictionaryPayload>((term, signal) => lookupDictionary(term, signal));
export const studyHelpKey = (guide: StudyHelpGuideId, slug: string) => `${guide}/${slug}`;
export const studyHelpEntries = createSharedRequests<StudyHelpEntry>((key, signal) => {
  const [guide, slug] = key.split("/") as [StudyHelpGuideId, string];
  return lookupStudyHelp(guide, slug, signal);
});
export const lexiconKey = (language: BiblicalLanguage, term: string) => `${language}:${term}`;
export const lexiconLookups = createSharedRequests<StrongsLookup>((key, signal) => {
  const split = key.indexOf(":");
  return lookupLexicon(key.slice(0, split) as StrongsLanguage, key.slice(split + 1), signal);
});

// ---- Study helps ----

export type StudyHelpGuideResult = { guide: StudyHelpGuide; status: SourceStatus; matches: StudyHelpMatches };

/** Which study-help guides have topics for the term (the committed index is bundled, so this never waits). */
export function studyHelpResults(term: string): StudyHelpGuideResult[] {
  return STUDY_HELP_GUIDES.map((guide) => {
    const matches = findStudyHelpMatches(INDEX.guides[guide.id].entries, term);
    return { guide, status: matches.entries.length || matches.related.length ? "found" : "empty", matches };
  });
}

/** Back-compatible summary of the matches by guide. */
export type StudyHelpMatchSet = Array<{ guide: StudyHelpGuideId; label: string; entries: Array<{ title: string; slug: string }>; related: Array<{ title: string; slug: string }> }>;
export function studyHelpMatches(term: string): StudyHelpMatchSet {
  return studyHelpResults(term).map(({ guide, matches }) => ({ guide: guide.id, label: guide.label, entries: matches.entries, related: matches.related }));
}

function inlineRuns(nodes: StudyHelpInline[], style: Partial<Run & { path?: string }> = {}, out: Array<Run & { path?: string }> = []) {
  for (const node of nodes) {
    if (typeof node === "string") out.push({ ...style, text: node });
    else if ("mark" in node) inlineRuns(node.children, { ...style, ...(node.mark === "em" ? { italic: true } : node.mark === "strong" || node.mark === "key" ? { bold: true } : {}) }, out);
    else inlineRuns(node.children, { ...style, ...(node.appHref ? { path: toAppHref(node.appHref) } : { url: node.href }) }, out);
  }
  return out;
}

/** A study helps entry as the app's generic native blocks; scripture references open in the reader. */
export function studyHelpBlocks(blocks: StudyHelpBlock[]): Block[] {
  return blocks.map((block): Block => {
    if (block.type === "heading") return { kind: "heading", depth: 4, runs: inlineRuns(block.content) };
    if (block.type === "list") return { kind: "list", ordered: false, items: block.items.map((item) => [{ kind: "p", runs: inlineRuns(item) }]) };
    return { kind: "p", runs: inlineRuns(block.content, block.style === "title" ? { bold: true } : {}) };
  });
}

// ---- Biblical languages ----

export const LANGUAGE_LABELS: Record<BiblicalLanguage, string> = { hebrew: "Hebrew", greek: "Greek" };

/** The term Strong's is searched with, the chapter's interlinear, and the languages in the order to offer them. */
export function biblicalLanguagePlan(term: string, context?: WordStudyContext | null): {
  term: string;
  searchable: boolean;
  interlinear: BibleInterlinearLink | null;
  order: BiblicalLanguage[];
} {
  const interlinear = getBibleInterlinearLink(context);
  const lexiconTerm = normalizeStudyTerm(term) || term;
  return {
    term: lexiconTerm,
    searchable: lexiconTerm.length > 0 && lexiconTerm.length <= LEXICON_MAX_TERM,
    interlinear,
    // The language of the testament being read first.
    order: interlinear?.testament === "new" ? ["greek", "hebrew"] : ["hebrew", "greek"],
  };
}

/** The biblical languages section's status: an interlinear is something to show even when no entry matched. */
export function languagesStatus(statuses: SourceStatus[], interlinear: BibleInterlinearLink | null): SourceStatus {
  const status = sectionStatus(statuses);
  return interlinear && status === "empty" ? "found" : status;
}

// ---- English meanings ----

export type LookupState = { status: "loading" } | { status: "error"; message?: string } | { status: "ready"; payload: DictionaryPayload };

export type EnglishResults = {
  status: SourceStatus;
  dictionaryGroups: { edition: DictionaryEdition; source: string; rows: DictionaryEntry[] }[];
  etymologyItems: EtymologyItem[];
};

/** Every edition's entries, then the word histories (WordStudyPanel's englishResults). */
export function englishResults(lookup: LookupState): EnglishResults {
  const payload = lookup.status === "ready" ? lookup.payload : null;
  const dictionaryGroups = EDITIONS.map((edition) => ({
    edition,
    source: payload?.providerLabels?.[edition] || "Dictionary",
    rows: payload?.byEdition?.[edition]?.entries ?? [],
  })).filter((group) => group.rows.length > 0);
  const etymologyItems = payload?.etymology?.items ?? [];
  const status: SourceStatus = lookup.status !== "ready" ? lookup.status : dictionaryGroups.length || etymologyItems.length ? "found" : "empty";
  return { status, dictionaryGroups, etymologyItems };
}

// ---- What was checked and had nothing ----

export type NoMatch = { id: string; label: string; link?: { url: string; text: string; a11y: string } };

/** The sources that had nothing for the term, so hiding them never hides that they were checked. */
export function noMatches({
  helps,
  languages,
  lexicon,
  english,
  englishSearched = true,
}: {
  helps: StudyHelpGuideResult[];
  languages: Array<{ key: BiblicalLanguage; status: SourceStatus }>;
  lexicon: { term: string; searchable: boolean };
  english: EnglishResults;
  /** False when the term was too long to send to the dictionary, so it was never asked. */
  englishSearched?: boolean;
}): NoMatch[] {
  const sources: NoMatch[] = [
    ...helps.filter((result) => result.status === "empty").map(({ guide }) => ({ id: guide.id, label: guide.label, link: { url: studyHelpBrowseUrl(guide.id), text: "Browse", a11y: `Browse the ${guide.label}` } })),
    ...languages
      .filter((result) => result.status === "empty")
      .map(({ key }) => ({
        id: key,
        label: lexicon.searchable ? `Strong’s ${LANGUAGE_LABELS[key]}` : `Strong’s ${LANGUAGE_LABELS[key]} (too long to look up)`,
        link: { url: bibleHubLexiconSearchUrl(key, lexicon.term), text: "Search Bible Hub", a11y: `Search Bible Hub’s ${LANGUAGE_LABELS[key]} lexicon` },
      })),
  ];
  const unasked = englishSearched ? "" : " (too long to look up)";
  if (english.status === "empty" || (english.status === "found" && english.dictionaryGroups.length === 0)) sources.push({ id: "dictionary", label: `English dictionaries${unasked}` });
  if (english.status === "empty" || (english.status === "found" && english.etymologyItems.length === 0)) sources.push({ id: "etymology", label: `Word histories${unasked}` });
  return sources;
}

/** "2 sources", "1 entry". */
export const plural = (count: number, one: string, many: string) => ({ value: count, unit: count === 1 ? one : many });
