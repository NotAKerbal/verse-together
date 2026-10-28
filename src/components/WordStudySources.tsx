"use client";

import { useFaithTradition } from "@/lib/useFaithTradition";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  STUDY_HELP_GUIDES,
  findStudyHelpMatches,
  normalizeStudyTerm,
  studyHelpBrowseUrl,
  studyHelpEntryUrl,
  type StudyHelpGuide,
  type StudyHelpGuideId,
  type StudyHelpMatches,
  type StudyHelpsIndex,
} from "@/lib/studyHelps";
import type { StudyHelpEntry } from "@/lib/studyHelpContent";
import type { StrongsLanguage, StrongsLookup } from "@/lib/strongsLexicon";
import { createSharedRequests, fetchOkJson } from "@/lib/sharedRequests";
import {
  bibleHubLexiconSearchUrl,
  getBibleInterlinearLink,
  type BibleInterlinearLink,
  type BiblicalLanguage,
  type WordStudyContext,
} from "@/lib/wordStudySources";
import { lookupStatus, sectionStatus, visibleSources, type SourceStatus } from "@/lib/exploreSources";
import { StudyHelpArticle } from "@/components/StudyHelpArticle";
import { LexiconResults } from "@/components/LexiconResults";
import { ExploreNotice, ExploreRow, ExploreRows, ExploreSection, GlyphText, plural, type ExploreDisclosure } from "@/components/ExploreSection";
import { useSharedResource, type ResourceState } from "@/components/useSharedResource";
import {
  ExternalIcon,
  ExternalLink,
  LoadError,
  LoadingLines,
  eyebrow,
  linkFocus,
  secondaryLink,
} from "@/components/WordStudyLinks";

// The topic list (~130 KB) loads only once someone explores a word, then stays for the session.
let studyHelpsIndex: StudyHelpsIndex | null = null;
let studyHelpsIndexRequest: Promise<StudyHelpsIndex> | null = null;

export function loadStudyHelpsIndex(): Promise<StudyHelpsIndex> {
  studyHelpsIndexRequest ??= import("@/lib/generated/studyHelpsIndex.json").then(
    (module) => (studyHelpsIndex = module.default as unknown as StudyHelpsIndex),
    (error: unknown) => {
      studyHelpsIndexRequest = null;
      throw error;
    }
  );
  return studyHelpsIndexRequest;
}

type IndexState = { status: "loading" } | { status: "ready"; index: StudyHelpsIndex } | { status: "unavailable" };

function useStudyHelpsIndex(enabled = true): [IndexState, () => void] {
  const [state, setState] = useState<IndexState>(() =>
    studyHelpsIndex ? { status: "ready", index: studyHelpsIndex } : { status: "loading" }
  );
  const [attempt, setAttempt] = useState(0);
  const loaded = state.status === "ready";

  useEffect(() => {
    if (loaded || !enabled) return;
    let active = true;
    loadStudyHelpsIndex().then(
      (index) => {
        if (active) setState({ status: "ready", index });
      },
      () => {
        if (active) setState({ status: "unavailable" });
      }
    );
    return () => {
      active = false;
    };
  }, [loaded, attempt, enabled]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  return [state, retry];
}

// Entry text and lexicon results, shared by the reader's desktop and mobile panels and kept for the session.
const studyHelpKey = (guide: StudyHelpGuideId, slug: string) => `${guide}/${slug}`;
export const studyHelpEntries = createSharedRequests<StudyHelpEntry>(async (key, signal) => {
  const [guide, slug] = key.split("/");
  const params = new URLSearchParams({ guide, slug });
  return (await fetchOkJson<{ entry: StudyHelpEntry }>(`/api/tools/study-helps?${params}`, signal)).entry;
});

const lexiconKey = (language: StrongsLanguage, term: string) => `${language}:${term}`;
export const lexiconLookups = createSharedRequests<StrongsLookup>(async (key, signal) => {
  const [language, term] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  const params = new URLSearchParams({ language, term });
  return (await fetchOkJson<{ lookup: StrongsLookup }>(`/api/tools/lexicon?${params}`, signal)).lookup;
});

function StudyHelpEntryPanel({ guide, slug, title, onSelectTopic }: {
  guide: StudyHelpGuide;
  slug: string;
  title: string | null;
  onSelectTopic: (slug: string) => void;
}) {
  const [state, retry] = useSharedResource(studyHelpEntries, studyHelpKey(guide.id, slug));
  if (state.status === "ready") {
    return <StudyHelpArticle key={slug} entry={state.data} guideLabel={guide.label} onSelectTopic={onSelectTopic} />;
  }
  if (state.status === "error") {
    return (
      <LoadError message={`${title ?? "This entry"} didn’t load from the ${guide.label}.`} onRetry={retry}>
        <ExternalLink href={studyHelpEntryUrl(guide.id, slug)} className={secondaryLink}>
          Read at source
          <ExternalIcon />
        </ExternalLink>
      </LoadError>
    );
  }
  return <LoadingLines label={`Loading ${title ?? "entry"}…`} />;
}

/** A guide's row, titled with the topic it shows; open, it offers the guide's other matching topics in place. */
function StudyHelpGuideRow({ guide, matches }: { guide: StudyHelpGuide; matches: StudyHelpMatches }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const entryRef = useRef<HTMLDivElement>(null);
  const topicsId = useId();
  const topics = useMemo(() => [...matches.entries, ...matches.related], [matches]);
  const slug = chosen ?? topics[0]?.slug ?? null;
  const listed = topics.find((topic) => topic.slug === slug)?.title ?? null;
  // A topic opened from an entry's text may not be among the matches; its title then comes with its entry.
  const [unlisted] = useSharedResource(studyHelpEntries, slug != null && listed == null ? studyHelpKey(guide.id, slug) : null);
  const title = listed ?? (unlisted.status === "ready" ? unlisted.data.title : null);

  // A topic named in the entry's text replaces the entry; focus moves to the new entry, not back to the top.
  const openTopicFromText = useCallback((next: string) => {
    setChosen(next);
    entryRef.current?.focus();
  }, []);

  if (slug == null) return null;

  return (
    <ExploreRow id={guide.id} label={guide.label} title={title ?? "Related topic"}>
      <div className="space-y-3">
        {topics.length > 1 ? (
          <div className="space-y-1.5">
            <p className={eyebrow} id={topicsId}>
              {matches.entries.length ? "Matching and related topics" : "Related topics"}
            </p>
            <ul aria-labelledby={topicsId} className="flex flex-wrap gap-1.5">
              {topics.map((topic) => (
                <li key={topic.slug} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={topic.slug === slug}
                    onClick={() => setChosen(topic.slug)}
                    className={`inline-flex min-h-10 max-w-full items-center rounded-full border px-3 text-left text-xs transition-colors motion-reduce:transition-none ${linkFocus} ${
                      topic.slug === slug
                        ? "border-[color:var(--explore-accent)] bg-[color:var(--explore-accent)] text-[color:var(--explore-on-accent)]"
                        : "border-[color:var(--explore-edge)] hover:bg-[color:var(--explore-row-hover)]"
                    }`}
                  >
                    <span className="break-words">{topic.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div ref={entryRef} tabIndex={-1} className={`rounded ${linkFocus}`}>
          <StudyHelpEntryPanel guide={guide} slug={slug} title={title} onSelectTopic={openTopicFromText} />
        </div>
        <ExternalLink href={studyHelpBrowseUrl(guide.id)} className={secondaryLink}>
          Browse the {guide.label}
          <ExternalIcon />
        </ExternalLink>
      </div>
    </ExploreRow>
  );
}

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
    </svg>
  );
}

export type StudyHelpGuideResult = { guide: StudyHelpGuide; status: SourceStatus; matches: StudyHelpMatches | null };
export type ScriptureHelps = { guides: StudyHelpGuideResult[]; status: SourceStatus; retry: () => void };

/** Which study-help guides have topics for the word, once the topic list has loaded. */
export function useScriptureHelps(word: string): ScriptureHelps {
  const { showLdsContent } = useFaithTradition();
  const [indexState, retry] = useStudyHelpsIndex(showLdsContent);
  const guides = useMemo(() => (showLdsContent ? STUDY_HELP_GUIDES : []).map((guide): StudyHelpGuideResult => {
    if (indexState.status !== "ready") {
      return { guide, status: indexState.status === "loading" ? "loading" : "error", matches: null };
    }
    const matches = findStudyHelpMatches(indexState.index.guides[guide.id].entries, word);
    return { guide, status: matches.entries.length || matches.related.length ? "found" : "empty", matches };
  }), [indexState, word, showLdsContent]);
  return { guides, status: sectionStatus(guides.map((result) => result.status)), retry };
}

export function ScriptureHelpsSection({ word, helps, disclosure }: { word: string; helps: ScriptureHelps; disclosure: ExploreDisclosure }) {
  if (helps.status === "empty") return null;
  const found = helps.guides.filter((result) => result.status === "found" && result.matches);
  return (
    <ExploreSection
      tone="sage"
      icon={<BookIcon />}
      title="Study helps"
      summary={(found.length ? found : helps.guides).map(({ guide }) => guide.label).join(" · ")}
      status={helps.status}
      count={found.length ? plural(found.length, "source", "sources") : null}
      disclosure={disclosure}
    >
      {helps.status === "loading" ? (
        <ExploreNotice><LoadingLines label={`Finding study-help topics for “${word}”…`} /></ExploreNotice>
      ) : helps.status === "error" ? (
        <ExploreNotice>
          <LoadError message="Study-help topics didn’t load." onRetry={helps.retry}>
            {helps.guides.map(({ guide }) => (
              <ExternalLink key={guide.id} href={studyHelpBrowseUrl(guide.id)} className={secondaryLink}>
                Browse the {guide.label}
                <ExternalIcon />
              </ExternalLink>
            ))}
          </LoadError>
        </ExploreNotice>
      ) : (
        <ExploreRows>
          {found.map(({ guide, matches }) => (matches ? <StudyHelpGuideRow key={guide.id} guide={guide} matches={matches} /> : null))}
        </ExploreRows>
      )}
    </ExploreSection>
  );
}

export const LANGUAGE_LABELS: Record<BiblicalLanguage, string> = { hebrew: "Hebrew", greek: "Greek" };

export type LexiconResult = {
  key: BiblicalLanguage;
  status: SourceStatus;
  state: ResourceState<StrongsLookup>;
  retry: () => void;
};
export type BiblicalLanguages = {
  term: string;
  interlinear: BibleInterlinearLink | null;
  /** Both languages, the one of the testament being read first. */
  languages: LexiconResult[];
  status: SourceStatus;
};

const hasLexiconMatches = (lookup: StrongsLookup) => lookup.matches.length > 0;

/** Strong's entries for the word in both languages, looked up together so an empty language can be left out. */
export function useBiblicalLanguages(word: string, context?: WordStudyContext | null): BiblicalLanguages {
  const interlinear = getBibleInterlinearLink(context);
  const term = normalizeStudyTerm(word) || word;
  const [hebrew, retryHebrew] = useSharedResource(lexiconLookups, lexiconKey("hebrew", term));
  const [greek, retryGreek] = useSharedResource(lexiconLookups, lexiconKey("greek", term));
  const results: Record<BiblicalLanguage, LexiconResult> = {
    hebrew: { key: "hebrew", status: lookupStatus(hebrew, hasLexiconMatches), state: hebrew, retry: retryHebrew },
    greek: { key: "greek", status: lookupStatus(greek, hasLexiconMatches), state: greek, retry: retryGreek },
  };
  const languages = interlinear?.testament === "new" ? [results.greek, results.hebrew] : [results.hebrew, results.greek];
  const lexiconStatus = sectionStatus(languages.map((result) => result.status));
  return { term, interlinear, languages, status: interlinear && lexiconStatus === "empty" ? "found" : lexiconStatus };
}

function LexiconPanel({ language, term, state, retry }: { language: BiblicalLanguage; term: string; state: ResourceState<StrongsLookup>; retry: () => void }) {
  const search = (
    <ExternalLink href={bibleHubLexiconSearchUrl(language, term)} className={secondaryLink}>
      Search Bible Hub’s {LANGUAGE_LABELS[language]} lexicon<span className="sr-only"> for “{term}”</span>
      <ExternalIcon />
    </ExternalLink>
  );
  if (state.status === "ready") {
    return (
      <div>
        <LexiconResults lookup={state.data} />
        <div className="px-2.5">{search}</div>
      </div>
    );
  }
  return (
    <ExploreNotice>
      {state.status === "error" ? (
        <LoadError message={`${LANGUAGE_LABELS[language]} lexicon entries didn’t load.`} onRetry={retry}>{search}</LoadError>
      ) : (
        <LoadingLines label={`Looking up “${term}” in Strong’s ${LANGUAGE_LABELS[language]} dictionary…`} />
      )}
    </ExploreNotice>
  );
}

/** Strong's entries in both languages, the testament's first, and the chapter's interlinear when there is one. */
export function BiblicalLanguagesSection({ lexicons, disclosure }: { lexicons: BiblicalLanguages; disclosure: ExploreDisclosure }) {
  const { term, interlinear } = lexicons;
  if (lexicons.status === "empty") return null;
  const offered = visibleSources(lexicons.languages);
  const matchCount = offered.reduce((total, { state }) => total + (state.status === "ready" ? state.data.matches.length : 0), 0);
  const summary = [
    ...offered.map(({ key }) => LANGUAGE_LABELS[key]),
    ...(interlinear ? [`${interlinear.passage} interlinear`] : []),
  ].join(" · ");

  return (
    <ExploreSection
      tone="blue"
      icon={<GlyphText>αא</GlyphText>}
      title="Biblical languages"
      summary={summary}
      status={lexicons.status}
      count={matchCount ? plural(matchCount, "match", "matches") : null}
      disclosure={disclosure}
    >
      {offered.length ? (
        <p className="flex items-start gap-2 px-2.5 pb-1 text-xs leading-5 text-[color:var(--explore-accent)]">
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <span>
            <span className="font-semibold">Possibilities to explore, not the word in this verse.</span> Strong’s entries whose
            King James renderings or definitions use “{term}”.
          </span>
        </p>
      ) : null}
      <div className="space-y-2">
        {offered.map((option) => (
          <LexiconPanel key={option.key} language={option.key} term={term} state={option.state} retry={option.retry} />
        ))}
      </div>
      {interlinear ? (
        <ExternalLink
          href={interlinear.url}
          className="mt-1 grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors hover:bg-[color:var(--explore-row-hover)] motion-reduce:transition-none"
        >
          <span className="min-w-0">
            <span className="block text-xs leading-snug text-[color:var(--foreground-muted)]">
              {interlinear.testament === "old" ? "Hebrew (and Aramaic)" : "Greek"} text, word by word with English · Bible Hub
            </span>
            <span className="mt-px block font-serif text-base leading-snug">{interlinear.passage} interlinear</span>
          </span>
          <ExternalIcon />
        </ExternalLink>
      ) : null}
    </ExploreSection>
  );
}
