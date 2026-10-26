"use client";

// The unsaved journal entry: a blank note, ready to write in, with its reading chip above it and its day and Save
// entry below. It can be saved as a note, a reading, or both, as one entry (the provider's saveEntryDraft); the
// draft and its save live in the provider, so closing the panel or sheet keeps what was typed, and reopening it
// mid-save shows that save (read-only) until it settles.

import { useEffect, useId, useState, type ReactNode } from "react";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { EntryDraftProblem, followEntrySource, withLiveHref, type EntrySaveState } from "./entryDraft";
import LazyMarkdownEditor from "./LazyMarkdownEditor";
import ReadingChip, { type ReadingOption } from "./ReadingChip";
import { useConvexSignedIn } from "./useConvexSignedIn";

const SAVE_FAILED = "Your entry wasn't saved. Your text is still here; check your connection and try again.";
const DELETED_ELSEWHERE =
  "This entry was deleted in another window. Your text is still here: save again to keep it as a new entry.";
const CHANGED_ELSEWHERE =
  "This entry was changed in another window after it was first saved, so what's here wasn't added to it. Your text is still here: save it as a new entry, or open the saved one to compare.";
const KEPT_CHANGES =
  "Your entry was saved. Changes made while it was saving weren't included and are still here: save them as a new entry, or open the saved one.";

/** What to tell the person about the provider's last save, if anything. */
function saveNotice(save: EntrySaveState): string | null {
  switch (save.status) {
    case "failed":
      return SAVE_FAILED;
    case "deleted":
      return DELETED_ELSEWHERE;
    case "conflict":
      return CHANGED_ELSEWHERE;
    case "kept":
      return KEPT_CHANGES;
    default:
      return null;
  }
}

export default function JournalEntryComposer({
  options,
  onSaved,
  autoFocus = false,
  heading,
  followPage = false,
}: {
  /** What can be logged from here (the page's chapter or guide, or recent sources). */
  options: ReadingOption[];
  /** The first option is the page in view: an untouched draft follows it as the page changes. */
  followPage?: boolean;
  /** Show this entry, now the active note: the one just saved, or (Open saved entry) the one a save concerned. */
  onSaved: (id: string, journalDate: string) => void;
  /** Focus the note on opening (desktop; on phones the keyboard waits for a tap). */
  autoFocus?: boolean;
  /** A heading row above the entry, where the surface has none of its own. */
  heading?: ReactNode;
}) {
  const { entryDraft: draft, updateEntryDraft, saveEntryDraft, entrySave, openSavedEntry } = useInsightBuilder();
  const { user, ready: cloudReady, loading } = useConvexSignedIn();
  const ready = !loading && (!user || cloudReady);
  const fieldId = useId();
  // Shared with every composer (and outliving this one), so a reopened sheet shows a save already in flight.
  const saving = entrySave.status === "saving";
  // Problems found before anything was sent; the provider's outcome otherwise.
  const [problem, setProblem] = useState<string | null>(null);
  const notice = problem ?? saveNotice(entrySave);
  const detached = entrySave.status === "conflict" || entrySave.status === "kept" || entrySave.status === "deleted";

  // An untouched draft follows the page: navigating with the desktop panel open logs the chapter now shown.
  const pageSource = followPage ? (options[0]?.source ?? null) : null;
  useEffect(() => {
    if (!pageSource) return;
    updateEntryDraft((current) => followEntrySource(current, withLiveHref(pageSource, window.location)));
  }, [pageSource, updateEntryDraft]);

  const reading = draft.logReading && draft.source ? { source: draft.source, journalDate: draft.journalDate } : null;
  const chipOptions = draft.source ? [...options, { source: draft.source }] : options;

  async function save() {
    if (saving) return;
    if (!ready) {
      setProblem("Still connecting to your account. Try again in a moment.");
      return;
    }
    setProblem(null);
    try {
      const result = await saveEntryDraft();
      if (result.id) onSaved(result.id, result.journalDate);
    } catch (cause) {
      // Only EntryDraftProblem rejects (nothing was sent); the provider reports everything else as entrySave.
      setProblem(cause instanceof EntryDraftProblem ? cause.message : SAVE_FAILED);
    }
  }

  function openSaved() {
    const entry = openSavedEntry();
    if (entry) onSaved(entry.id, entry.journalDate);
  }

  return (
    <form
      className="flex min-w-0 flex-col gap-3 font-sans"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {heading}
      <fieldset disabled={saving} className="flex min-w-0 flex-col gap-3">
        <legend className="sr-only">New entry</legend>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <ReadingChip
            value={reading}
            options={chipOptions}
            defaultDate={draft.journalDate}
            disabled={saving}
            onChange={(next) =>
              updateEntryDraft((current) =>
                next
                  ? { ...current, source: next.source, journalDate: next.journalDate, logReading: true, edited: true }
                  : { ...current, logReading: false, edited: true }
              )
            }
          />
          {draft.source && !reading ? (
            <p className="min-w-0 text-xs text-[color:var(--foreground-muted)] wrap-anywhere">
              Linked to {draft.source.label}
            </p>
          ) : null}
        </div>
        <div className="flex min-h-48 flex-col rounded-[1rem] border-2 border-[color:var(--surface-border)] px-3 py-2 focus-within:border-[color:var(--accent-secondary)]">
          <LazyMarkdownEditor
            value={draft.text}
            onChange={(text) => updateEntryDraft((current) => ({ ...current, text }))}
            readOnly={saving}
            ariaLabel="Note"
            placeholder={reading ? "Add a note (optional)…" : "Write a note…"}
            autoFocus={autoFocus}
          />
        </div>
        {notice ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-sm font-semibold wrap-anywhere text-[color:var(--accent-rubric)]">{notice}</p>
            {!problem && (entrySave.status === "conflict" || entrySave.status === "kept") ? (
              <button
                type="button"
                onClick={openSaved}
                className="surface-button inline-flex h-11 items-center rounded-full border-2 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] lg:h-9"
              >
                Open saved entry
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label htmlFor={`${fieldId}-date`} className="min-w-0 space-y-1 text-sm font-semibold">
            Day
            <input
              id={`${fieldId}-date`}
              type="date"
              required
              value={draft.journalDate}
              onChange={(event) => {
                const journalDate = event.target.value;
                updateEntryDraft((current) => ({ ...current, journalDate, edited: true }));
              }}
              className="block h-11 max-w-full rounded-lg border-2 border-[color:var(--surface-border)] bg-transparent px-2 text-base font-normal lg:h-9 lg:text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={saving || !ready}
            className="inline-flex h-11 shrink-0 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-5 text-sm font-bold text-[color:var(--surface-button-active-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50 lg:h-9 lg:px-4"
          >
            {saving ? "Saving…" : entrySave.status === "failed" ? "Try again" : detached ? "Save as new entry" : "Save entry"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
