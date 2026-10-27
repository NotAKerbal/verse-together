"use client";

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
  type BiblicalLanguage,
  type WordStudyContext,
} from "@/lib/wordStudySources";
import { StudyHelpArticle } from "@/components/StudyHelpArticle";
import { LexiconResults } from "@/components/LexiconResults";
import { useSharedResource } from "@/components/useSharedResource";
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

function useStudyHelpsIndex(): IndexState {
  const [state, setState] = useState<IndexState>(() =>
    studyHelpsIndex ? { status: "ready", index: studyHelpsIndex } : { status: "loading" }
  );
  const loaded = state.status === "ready";

  useEffect(() => {
    if (loaded) return;
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
  }, [loaded]);

  return state;
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

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

function StudyHelpGuideCard({ guide, word, indexStatus, matches }: {
  guide: StudyHelpGuide;
  word: string;
  indexStatus: IndexState["status"];
  matches: StudyHelpMatches | null;
}) {
  const [open, setOpen] = useState(true);
  const [chosen, setChosen] = useState<string | null>(null);
  const entryRef = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  const topics = useMemo(() => (matches ? [...matches.entries, ...matches.related] : []), [matches]);
  const slug = chosen ?? topics[0]?.slug ?? null;
  const title = topics.find((topic) => topic.slug === slug)?.title ?? null;

  // A topic named in the entry's text replaces the entry; focus moves to the new entry, not back to the top.
  const openTopicFromText = useCallback((next: string) => {
    setChosen(next);
    entryRef.current?.focus();
  }, []);

  return (
    <article aria-label={guide.label} className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-card-strong)]">
      <header className="flex items-start gap-2 p-3 pb-2">
        <div className="min-w-0 flex-1">
          <h5 className="text-sm font-semibold">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((value) => !value)}
              className={`flex min-h-8 w-full items-center justify-between gap-2 rounded text-left ${linkFocus}`}
            >
              {guide.label}
              <Chevron open={open} />
            </button>
          </h5>
          <p className="text-xs text-[color:var(--foreground-muted)]">{guide.description}</p>
        </div>
        <ExternalLink
          href={studyHelpBrowseUrl(guide.id)}
          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full px-2 text-xs text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-button-hover)]"
        >
          Browse<span className="sr-only"> the {guide.label}</span>
          <ExternalIcon />
        </ExternalLink>
      </header>
      <div id={bodyId} hidden={!open} className="space-y-3 px-3 pb-3">
        {indexStatus === "loading" ? (
          <p role="status" className="text-xs text-[color:var(--foreground-muted)]">Finding topics for “{word}”…</p>
        ) : indexStatus === "unavailable" ? (
          <p className="text-xs leading-5 text-[color:var(--foreground-muted)]">Topic matches didn’t load. Browse the {guide.label} instead.</p>
        ) : slug == null ? (
          <p className="text-xs leading-5 text-[color:var(--foreground-muted)]">No “{word}” topic. Browse the {guide.label} for a related word.</p>
        ) : (
          <>
            {topics.length > 1 ? (
              <div className="space-y-1.5">
                <p className={eyebrow} id={`${bodyId}-topics`}>
                  {matches?.entries.length ? "Matching and related topics" : "Related topics"}
                </p>
                <ul aria-labelledby={`${bodyId}-topics`} className="flex flex-wrap gap-1.5">
                  {topics.map((topic) => (
                    <li key={topic.slug} className="min-w-0">
                      <button
                        type="button"
                        aria-pressed={topic.slug === slug}
                        onClick={() => setChosen(topic.slug)}
                        className={`inline-flex min-h-8 max-w-full items-center rounded-full border px-2.5 text-left text-xs transition-colors ${linkFocus} ${
                          topic.slug === slug
                            ? "border-[color:var(--surface-button-active)] bg-[color:var(--surface-button-active)] text-[color:var(--surface-button-active-text)]"
                            : "border-[color:var(--surface-border)] hover:bg-[color:var(--surface-button-hover)]"
                        }`}
                      >
                        <span className="break-words">{topic.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {open ? (
              <div ref={entryRef} tabIndex={-1} className={`rounded ${linkFocus}`}>
                <StudyHelpEntryPanel guide={guide} slug={slug} title={title} onSelectTopic={openTopicFromText} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

export function ScriptureHelpsSection({ word }: { word: string }) {
  const indexState = useStudyHelpsIndex();
  const index = indexState.status === "ready" ? indexState.index : null;
  const matchesByGuide = useMemo(
    () => (index ? STUDY_HELP_GUIDES.map((guide) => findStudyHelpMatches(index.guides[guide.id].entries, word)) : null),
    [index, word]
  );

  return (
    <section aria-label="Scripture study helps" className="space-y-3">
      <h4 className="font-serif text-xl">Scripture study helps</h4>
      <div className="space-y-2">
        {STUDY_HELP_GUIDES.map((guide, guideIndex) => (
          <StudyHelpGuideCard
            key={guide.id}
            guide={guide}
            word={word}
            indexStatus={indexState.status}
            matches={matchesByGuide?.[guideIndex] ?? null}
          />
        ))}
      </div>
    </section>
  );
}

const LANGUAGE_LABELS: Record<BiblicalLanguage, string> = { hebrew: "Hebrew", greek: "Greek" };

function LexiconPanel({ language, term }: { language: StrongsLanguage; term: string }) {
  const [state, retry] = useSharedResource(lexiconLookups, lexiconKey(language, term));
  const search = (
    <ExternalLink href={bibleHubLexiconSearchUrl(language, term)} className={secondaryLink}>
      Search Bible Hub’s {LANGUAGE_LABELS[language]} lexicon<span className="sr-only"> for “{term}”</span>
      <ExternalIcon />
    </ExternalLink>
  );
  if (state.status === "ready") {
    return (
      <div className="space-y-1">
        <LexiconResults lookup={state.data} />
        {search}
      </div>
    );
  }
  if (state.status === "error") {
    return <LoadError message={`${LANGUAGE_LABELS[language]} lexicon entries didn’t load.`} onRetry={retry}>{search}</LoadError>;
  }
  return <LoadingLines label={`Looking up “${term}” in Strong’s ${LANGUAGE_LABELS[language]} dictionary…`} />;
}

export function BiblicalLanguagesSection({ word, context }: { word: string; context?: WordStudyContext | null }) {
  const interlinear = getBibleInterlinearLink(context);
  const searchTerm = normalizeStudyTerm(word) || word;
  // Lead with, and first load, the language of the testament being read.
  const preferred: BiblicalLanguage = interlinear?.testament === "new" ? "greek" : "hebrew";
  const languages: BiblicalLanguage[] = preferred === "greek" ? ["greek", "hebrew"] : ["hebrew", "greek"];
  const [chosen, setChosen] = useState<BiblicalLanguage | null>(null);
  const language = chosen ?? preferred;
  const panelId = useId();

  return (
    <section aria-label="Biblical languages" className="space-y-3">
      <h4 className="font-serif text-xl">Biblical languages</h4>
      <div className="space-y-3 rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-card-strong)] p-3">
        <div role="group" aria-label="Lexicon language" className="flex gap-1.5">
          {languages.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === language}
              aria-controls={panelId}
              onClick={() => setChosen(option)}
              className={`inline-flex min-h-10 items-center rounded-full border px-3 text-sm transition-colors ${linkFocus} ${
                option === language
                  ? "border-[color:var(--surface-button-active)] bg-[color:var(--surface-button-active)] text-[color:var(--surface-button-active-text)]"
                  : "border-[color:var(--surface-border)] hover:bg-[color:var(--surface-button-hover)]"
              }`}
            >
              {LANGUAGE_LABELS[option]}
            </button>
          ))}
        </div>
        <div id={panelId}>
          <LexiconPanel key={language} language={language} term={searchTerm} />
        </div>
      </div>
      {interlinear ? (
        <ExternalLink
          href={interlinear.url}
          className="flex items-start justify-between gap-3 rounded-md border border-[color:var(--surface-border)] p-3 transition-colors hover:bg-[color:var(--surface-button-hover)]"
        >
          <span className="min-w-0 space-y-0.5">
            <span className="block text-sm font-semibold">{interlinear.passage} interlinear</span>
            <span className="block text-xs leading-5 text-[color:var(--foreground-muted)]">
              {interlinear.testament === "old" ? "Hebrew (and Aramaic)" : "Greek"} text of this chapter, word by word with English · Bible Hub
            </span>
          </span>
          <ExternalIcon />
        </ExternalLink>
      ) : null}
    </section>
  );
}
