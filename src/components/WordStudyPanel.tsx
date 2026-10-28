"use client";

import { useEffect, useReducer, useState } from "react";
import DictionaryEntryCard from "@/components/DictionaryEntryCard";
import EtymologyEntryCard from "@/components/EtymologyEntryCard";
import {
  BiblicalLanguagesSection,
  LANGUAGE_LABELS,
  ScriptureHelpsSection,
  useBiblicalLanguages,
  useScriptureHelps,
  type BiblicalLanguages,
  type ScriptureHelps,
} from "@/components/WordStudySources";
import { ExploreNotice, ExploreRow, ExploreRows, ExploreSection, GlyphText, plural, type ExploreDisclosure } from "@/components/ExploreSection";
import { ExternalIcon, ExternalLink, LoadError, LoadingLines, eyebrow, secondaryLink } from "@/components/WordStudyLinks";
import {
  EXPLORE_COLLAPSED,
  nextExploreOpen,
  sectionStatus,
  type ExploreSectionKey,
  type SourceStatus,
} from "@/lib/exploreSources";
import { studyHelpBrowseUrl } from "@/lib/studyHelps";
import { bibleHubLexiconSearchUrl, type WordStudyContext } from "@/lib/wordStudySources";

type Props = {
  word: string;
  panelId?: string;
  title?: string;
  /** The chapter being read, for passage-specific sources such as a Bible interlinear. */
  context?: WordStudyContext | null;
  onClose?: () => void;
};

type DictionaryEdition = "1828" | "1844" | "1913";
type DictionaryEntry = {
  id: string;
  edition: DictionaryEdition;
  word: string;
  heading: string | null;
  entryText: string;
  pronounce: string | null;
};
type EtymologyItem = { id: string; source: string; word: string; text: string };
export type DictionaryPayload = {
  ok: boolean;
  enabled: boolean;
  byEdition?: Partial<Record<DictionaryEdition, { entries: DictionaryEntry[] } | null>>;
  providerLabels?: Partial<Record<DictionaryEdition, string>>;
  etymology?: { items: EtymologyItem[] };
};
export type LookupState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; payload: DictionaryPayload };

const EDITIONS: DictionaryEdition[] = ["1828", "1844", "1913"];

export default function WordStudyPanel(props: Props) {
  const word = props.word.trim().toLowerCase();
  if (!word) return null;
  // A new selection starts with a fresh loading state, never the previous word's results.
  return <WordStudyLookup key={word} {...props} word={word} />;
}

function WordStudyLookup({ word, panelId, title = "Word Study", context, onClose }: Props) {
  const [lookup, setLookup] = useState<LookupState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadEntries() {
      try {
        const response = await fetch(`/api/tools/dictionary?term=${encodeURIComponent(word)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Lookup request failed");
        const payload = (await response.json()) as DictionaryPayload;
        if (!payload.ok || !payload.enabled) throw new Error("Lookup unavailable");
        if (!controller.signal.aborted) setLookup({ status: "ready", payload });
      } catch {
        if (!controller.signal.aborted) setLookup({ status: "error" });
      }
    }

    void loadEntries();
    return () => controller.abort();
  }, [word, attempt]);

  function retryLookup() {
    setLookup({ status: "loading" });
    setAttempt((previous) => previous + 1);
  }

  const helps = useScriptureHelps(word);
  const lexicons = useBiblicalLanguages(word, context);
  const english = englishResults(lookup);
  const nothingFound = sectionStatus([helps.status, lexicons.status, english.status]) === "empty";
  const [openState, toggle] = useReducer(nextExploreOpen, EXPLORE_COLLAPSED);
  const disclosure = (section: ExploreSectionKey): ExploreDisclosure => ({
    open: openState.section === section,
    openRow: openState.section === section ? openState.row : null,
    onToggle: () => toggle({ type: "toggleSection", section }),
    onToggleRow: (row) => toggle({ type: "toggleRow", row }),
  });

  return (
    <section
      id={panelId}
      data-word-study-panel="true"
      aria-label={`${title}: ${word}`}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-card)]"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--accent-rubric)]">{title}</p>
          <h3 className="mt-1 break-words font-serif text-[1.75rem] leading-tight">{word}</h3>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close word study"
            className="-mr-1.5 -mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-[10px] text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)] motion-reduce:transition-none"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        ) : null}
      </header>

      <div
        tabIndex={0}
        role="region"
        aria-label={`Sources for ${word}`}
        className="@container min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pt-1 pb-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)]"
      >
        {nothingFound ? (
          <div className="space-y-1" role="status">
            <p className="text-sm font-medium">Nothing found for “{word}”.</p>
            <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">
              None of our sources have this word. Try selecting its base form, or search the sources below.
            </p>
          </div>
        ) : (
          <ul aria-label={`Ways to explore “${word}”`} className="grid list-none gap-2.5 p-0">
            <ScriptureHelpsSection word={word} helps={helps} disclosure={disclosure("helps")} />
            <BiblicalLanguagesSection lexicons={lexicons} disclosure={disclosure("languages")} />
            <EnglishMeaningsSection word={word} english={english} onRetry={retryLookup} disclosure={disclosure("english")} />
          </ul>
        )}
        <NoMatchesList word={word} helps={helps} lexicons={lexicons} english={english} />
      </div>
    </section>
  );
}

export type EnglishResults = {
  status: SourceStatus;
  dictionaryGroups: { edition: DictionaryEdition; source: string; rows: DictionaryEntry[] }[];
  etymologyItems: EtymologyItem[];
};

export function englishResults(lookup: LookupState): EnglishResults {
  const payload = lookup.status === "ready" ? lookup.payload : null;
  const dictionaryGroups = EDITIONS.map((edition) => ({
    edition,
    source: payload?.providerLabels?.[edition] || "Dictionary",
    rows: payload?.byEdition?.[edition]?.entries ?? [],
  })).filter((group) => group.rows.length > 0);
  const etymologyItems = payload?.etymology?.items ?? [];
  const status: SourceStatus =
    lookup.status !== "ready" ? lookup.status : dictionaryGroups.length || etymologyItems.length ? "found" : "empty";
  return { status, dictionaryGroups, etymologyItems };
}

/** The English dictionary and word-history results, in whichever state the lookup is in; nothing once both are empty. */
export function EnglishMeaningsSection({ word, english, onRetry, disclosure }: {
  word: string;
  english: EnglishResults;
  onRetry: () => void;
  disclosure: ExploreDisclosure;
}) {
  const { status, dictionaryGroups, etymologyItems } = english;
  if (status === "empty") return null;
  const entryCount = dictionaryGroups.reduce((total, group) => total + group.rows.length, 0) + etymologyItems.length;
  const parts = status === "found"
    ? [dictionaryGroups.length ? "Definitions" : null, etymologyItems.length ? "Word history" : null].filter(Boolean)
    : ["Definitions", "Word history"];

  return (
    <ExploreSection
      tone="clay"
      icon={<GlyphText>Aa</GlyphText>}
      title="English meanings"
      summary={parts.join(" · ")}
      status={status}
      count={entryCount ? plural(entryCount, "entry", "entries") : null}
      disclosure={disclosure}
    >
      {status === "loading" ? (
        <ExploreNotice><LoadingLines label={`Looking up ${word}…`} /></ExploreNotice>
      ) : status === "error" ? (
        <ExploreNotice>
          <LoadError message="We couldn’t load dictionary entries for this word. Check your connection and try again." onRetry={onRetry} />
        </ExploreNotice>
      ) : (
        <ExploreRows>
          {dictionaryGroups.map((group) =>
            group.rows.map((entry, index) => (
              <ExploreRow
                key={entry.id}
                id={`dictionary:${entry.id}`}
                label={group.rows.length > 1 ? `${group.source} · entry ${index + 1}` : group.source}
                title={entry.word}
              >
                <DictionaryEntryCard entry={entry} edition={group.edition} />
              </ExploreRow>
            ))
          )}
          {etymologyItems.map((item) => (
            <ExploreRow key={item.id} id={`etymology:${item.id}`} label={`Word history · ${item.source}`} title={item.word}>
              <EtymologyEntryCard item={item} />
            </ExploreRow>
          ))}
        </ExploreRows>
      )}
    </ExploreSection>
  );
}

type NoMatch = { id: string; label: string; link?: { href: string; text: string; srText: string } };

/** The sources that had nothing for the word, so hiding them never hides that they were checked. */
function NoMatchesList({ word, helps, lexicons, english }: {
  word: string;
  helps: ScriptureHelps;
  lexicons: BiblicalLanguages;
  english: EnglishResults;
}) {
  const sources: NoMatch[] = [
    ...helps.guides.filter((result) => result.status === "empty").map(({ guide }) => ({
      id: guide.id,
      label: guide.label,
      link: { href: studyHelpBrowseUrl(guide.id), text: "Browse", srText: ` the ${guide.label}` },
    })),
    ...lexicons.languages.filter((result) => result.status === "empty").map(({ key }) => ({
      id: key,
      label: `Strong’s ${LANGUAGE_LABELS[key]}`,
      link: { href: bibleHubLexiconSearchUrl(key, lexicons.term), text: "Search Bible Hub", srText: `’s ${LANGUAGE_LABELS[key]} lexicon` },
    })),
  ];
  if (english.status === "empty" || (english.status === "found" && english.dictionaryGroups.length === 0)) {
    sources.push({ id: "dictionary", label: "English dictionaries" });
  }
  if (english.status === "empty" || (english.status === "found" && english.etymologyItems.length === 0)) {
    sources.push({ id: "etymology", label: "Word histories" });
  }
  if (sources.length === 0) return null;

  return (
    <details className="rounded-[14px] bg-[color:var(--surface-card-soft)] px-3">
      <summary className={`cursor-pointer rounded py-3 ${eyebrow} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)]`}>No matches for “{word}” in {sources.length} {sources.length === 1 ? "source" : "sources"}</summary>
      <ul className="mb-2 divide-y divide-[color:var(--surface-border)]">
        {sources.map((source) => (
          <li key={source.id} className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 text-xs">
            <span>{source.label}</span>
            {source.link ? (
              <ExternalLink href={source.link.href} className={secondaryLink}>
                {source.link.text}<span className="sr-only">{source.link.srText}</span>
                <ExternalIcon />
              </ExternalLink>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
