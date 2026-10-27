"use client";

import { useEffect, useState } from "react";
import DictionaryEntryCard from "@/components/DictionaryEntryCard";
import EtymologyEntryCard from "@/components/EtymologyEntryCard";
import { BiblicalLanguagesSection, ScriptureHelpsSection } from "@/components/WordStudySources";
import type { WordStudyContext } from "@/lib/wordStudySources";

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
  etymology?: { items: EtymologyItem[] };
};
export type LookupState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; payload: DictionaryPayload };

const EDITIONS: DictionaryEdition[] = ["1828", "1844", "1913"];
const subheading = "text-xs font-semibold uppercase tracking-wide text-[color:var(--foreground-muted)]";

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

  return (
    <section
      id={panelId}
      data-word-study-panel="true"
      aria-label={`${title}: ${word}`}
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-card)]"
    >
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close word study"
          className="absolute right-2 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-[color:var(--surface-card)] text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)]"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      ) : null}

      <header className="shrink-0 border-b border-[color:var(--surface-border)] py-3 pl-4 pr-12">
        <p className="text-[0.7rem] font-medium uppercase tracking-wide text-[color:var(--foreground-muted)]">{title}</p>
        <h3 className="break-words font-serif text-2xl leading-tight">{word}</h3>
      </header>

      <div
        tabIndex={0}
        role="region"
        aria-label={`Sources for ${word}`}
        className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)]"
      >
        <ScriptureHelpsSection word={word} />
        <BiblicalLanguagesSection word={word} context={context} />
        <EnglishMeaningsSection word={word} lookup={lookup} onRetry={retryLookup} />
      </div>
    </section>
  );
}

/** The English dictionary and word-history results, in whichever state the lookup is in. */
export function EnglishMeaningsSection({ word, lookup, onRetry }: { word: string; lookup: LookupState; onRetry: () => void }) {
  const payload = lookup.status === "ready" ? lookup.payload : null;
  const dictionaryGroups = EDITIONS.map((edition) => ({
    edition,
    rows: payload?.byEdition?.[edition]?.entries ?? [],
  })).filter((group) => group.rows.length > 0);
  const etymologyItems = payload?.etymology?.items ?? [];
  const hasDictionaryEntries = dictionaryGroups.length > 0;
  const hasEtymologyEntries = etymologyItems.length > 0;

  return (
    <section aria-label="English meanings" className="space-y-3 border-t border-[color:var(--surface-border)] pt-5">
      <h4 className="font-serif text-xl">English meanings</h4>
      {lookup.status === "loading" ? (
        <div className="space-y-4" role="status">
          <p className="flex items-center gap-2 text-sm text-[color:var(--foreground-muted)]">
            <span aria-hidden="true" className="size-3.5 rounded-full border-2 border-[color:var(--surface-border)] border-t-[color:var(--accent-rubric)] motion-safe:animate-spin" />
            Looking up {word}…
          </p>
          <div aria-hidden="true" className="space-y-2 motion-safe:animate-pulse">
            <div className="h-3 w-2/5 rounded bg-[color:var(--surface-card-soft)]" />
            <div className="h-3 w-full rounded bg-[color:var(--surface-card-soft)]" />
            <div className="h-3 w-4/5 rounded bg-[color:var(--surface-card-soft)]" />
          </div>
        </div>
      ) : lookup.status === "error" ? (
        <div className="space-y-3" role="status">
          <div className="space-y-1">
            <p className="text-sm font-medium">We couldn’t load dictionary entries for this word.</p>
            <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">Check your connection and try again.</p>
          </div>
          <button type="button" onClick={onRetry} className="surface-button min-h-10 rounded-full border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)]">Try again</button>
        </div>
      ) : hasDictionaryEntries || hasEtymologyEntries ? (
        <div className="space-y-6">
          <section aria-label="Dictionary" className="space-y-3">
            <h5 className={subheading}>Dictionary</h5>
            {hasDictionaryEntries ? dictionaryGroups.map((group) => (
              <div key={group.edition} className="space-y-2">
                {group.rows.map((entry) => (
                  <DictionaryEntryCard key={entry.id} entry={entry} edition={group.edition} />
                ))}
              </div>
            )) : (
              <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">Our sources don’t have a definition for this word.</p>
            )}
          </section>
          <section aria-label="Etymology" className="space-y-3">
            <h5 className={subheading}>Etymology</h5>
            {hasEtymologyEntries ? etymologyItems.map((item) => (
              <EtymologyEntryCard key={item.id} item={item} />
            )) : (
              <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">Our sources don’t have a word history for this word.</p>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-1" role="status">
          <p className="text-sm font-medium">No dictionary entry for this word.</p>
          <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">
            Our English dictionaries don’t have this word. Try selecting its base form, or use the study helps above.
          </p>
        </div>
      )}
    </section>
  );
}
