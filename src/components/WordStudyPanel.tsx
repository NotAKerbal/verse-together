"use client";

import { useEffect, useState } from "react";
import DictionaryEntryCard from "@/components/DictionaryEntryCard";
import EtymologyEntryCard from "@/components/EtymologyEntryCard";

type Props = {
  word: string;
  panelId?: string;
  title?: string;
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
type DictionaryPayload = {
  ok: boolean;
  enabled: boolean;
  byEdition?: Partial<Record<DictionaryEdition, { entries: DictionaryEntry[] } | null>>;
  etymology?: { items: EtymologyItem[] };
};
type LookupState =
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

function WordStudyLookup({ word, panelId, title = "Word Study", onClose }: Props) {
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

  const payload = lookup.status === "ready" ? lookup.payload : null;
  const dictionaryGroups = EDITIONS.map((edition) => ({
    edition,
    rows: payload?.byEdition?.[edition]?.entries ?? [],
  })).filter((group) => group.rows.length > 0);
  const etymologyItems = payload?.etymology?.items ?? [];
  const hasDictionaryEntries = dictionaryGroups.length > 0;
  const hasEtymologyEntries = etymologyItems.length > 0;

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

      <div
        tabIndex={0}
        role="region"
        aria-label="Dictionary and etymology"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)]"
      >
        {lookup.status === "loading" ? (
          <div className="space-y-4 p-4" role="status">
            <p className="flex items-center gap-2 pr-10 text-sm text-[color:var(--foreground-muted)]">
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
          <div className="space-y-3 p-4" role="status">
            <div className="space-y-1">
              <p className="pr-10 text-sm font-medium">We couldn’t load this word.</p>
              <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">Check your connection and try again.</p>
            </div>
            <button type="button" onClick={retryLookup} className="surface-button min-h-10 rounded-full border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)]">Try again</button>
          </div>
        ) : hasDictionaryEntries || hasEtymologyEntries ? (
          <div className="space-y-6 p-4">
            <section aria-label="Dictionary" className="space-y-3">
              <h4 className="pr-10 font-serif text-xl">Dictionary</h4>
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
              <h4 className="font-serif text-xl">Etymology</h4>
              {hasEtymologyEntries ? etymologyItems.map((item) => (
                <EtymologyEntryCard key={item.id} item={item} />
              )) : (
                <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">Our sources don’t have a word history for this word.</p>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-1 p-4" role="status">
            <p className="pr-10 text-sm font-medium">No entry available for this word.</p>
            <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">
              Our sources don’t have an entry for this word. Try selecting its base form or another word in the passage.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
