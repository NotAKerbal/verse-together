"use client";

// "Log reading": records that the reader read something on a chosen day, in the private reading history.
// It never marks a chapter complete (that is ChapterReadToggle's job). Each submit carries a request id; a
// retry of the same reading after an error reuses it so the server stores the reading once.

import { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook } from "@fortawesome/free-solid-svg-icons";
import { useReadingProgressActions } from "@/features/plans/useReadingProgress";
import { useAuth } from "@/lib/auth";
import { isSafeSourceHref, localDateKey, newRequestId, sourceKindLabel, type NoteSource } from "./journal";
import { useConvexSignedIn } from "./useConvexSignedIn";

export type ReadingLogOption = {
  source: NoteSource;
  /** Verses in the chapter, when known; lets the reader log part of a whole-chapter scripture source. */
  verseCount?: number;
};

type Props = {
  options: ReadingLogOption[];
  /** The day to log on, YYYY-MM-DD; defaults to the viewer's local today when the dialog opens. */
  defaultDate?: string;
  /** Use the page's live path and query for a source that points at the current page. */
  followLocation?: boolean;
  variant?: "compact" | "pill";
  label?: string;
  /** Accessible name when the visible label is shortened. */
  ariaLabel?: string;
  /** Shown but unavailable, e.g. while the chapter it logs is still loading. */
  disabled?: boolean;
  onLogged?: (journalDate: string) => void;
};

const JOURNAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function withLiveHref(source: NoteSource): NoteSource {
  if (typeof window === "undefined") return source;
  const { pathname, search } = window.location;
  if (source.href.split(/[?#]/)[0] !== pathname) return source;
  const href = `${pathname}${search}`;
  return isSafeSourceHref(href) ? { ...source, href } : source;
}

function canLogPart(option: ReadingLogOption | undefined): option is ReadingLogOption & { verseCount: number } {
  return (
    !!option &&
    option.source.kind === "scripture" &&
    option.source.chapter !== undefined &&
    option.source.verseStart === undefined &&
    typeof option.verseCount === "number" &&
    option.verseCount > 1
  );
}

function partialSource(source: NoteSource, start: number, end: number): NoteSource {
  const range = end !== start ? `${start}-${end}` : `${start}`;
  return {
    ...source,
    label: `${source.label}:${range}`.slice(0, 200),
    href: `${source.href.split("#")[0]}#v-${start}`,
    verseStart: start,
    verseEnd: end,
  };
}

const TRIGGER_CLASS = {
  compact:
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border surface-card-soft px-2.5 text-xs font-bold text-foreground hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 disabled:opacity-50",
  pill:
    "surface-button inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50",
};

export default function ReadingLogButton({
  options,
  defaultDate,
  followLocation = false,
  variant = "pill",
  label = "Log reading",
  ariaLabel,
  disabled = false,
  onLogged,
}: Props) {
  const { promptSignIn } = useAuth();
  const { user, ready, loading } = useConvexSignedIn();
  const { logReading } = useReadingProgressActions();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const fieldId = useId();

  const [choices, setChoices] = useState<ReadingLogOption[]>(options);
  const [choice, setChoice] = useState(0);
  const [part, setPart] = useState(false);
  const [verseStart, setVerseStart] = useState("1");
  const [verseEnd, setVerseEnd] = useState("1");
  const [journalDate, setJournalDate] = useState(defaultDate ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const submittingRef = useRef(false);
  // The id of the last attempt that didn't finish successfully, with what it sent.
  const pendingRef = useRef<{ requestId: string; fingerprint: string } | null>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    pendingRef.current = null;
  }, [user?.id]);

  const selected = choices[choice];
  const partAllowed = canLogPart(selected);

  function open() {
    if (!user) {
      void promptSignIn();
      return;
    }
    // Closing doesn't cancel a save; reopening while one is in flight shows it as it stands.
    if (submittingRef.current) {
      dialogRef.current?.showModal();
      return;
    }
    const live = options.map((option) => (followLocation ? { ...option, source: withLiveHref(option.source) } : option));
    setChoices(live);
    setChoice(0);
    setPart(false);
    setVerseStart("1");
    setVerseEnd("1");
    setJournalDate(defaultDate ?? localDateKey());
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function buildSource(): NoteSource | string {
    if (!selected) return "Choose what you read.";
    if (!part || !partAllowed) return selected.source;
    const start = Number(verseStart);
    const end = Number(verseEnd);
    const max = selected.verseCount;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1 || start > max || end > max) {
      return `Verses must be between 1 and ${max}.`;
    }
    if (end < start) return "The last verse can't come before the first.";
    return partialSource(selected.source, start, end);
  }

  async function submit() {
    if (submittingRef.current) return;
    if (!ready) {
      setError("Still connecting to your account. Try again in a moment.");
      return;
    }
    const source = buildSource();
    if (typeof source === "string") {
      setError(source);
      return;
    }
    if (!isSafeSourceHref(source.href)) {
      setError("This page can't be linked from your reading history.");
      return;
    }
    if (!JOURNAL_DATE.test(journalDate)) {
      setError("Choose the day you read it.");
      return;
    }
    const fingerprint = JSON.stringify({ source, journalDate });
    const attempt =
      pendingRef.current && pendingRef.current.fingerprint === fingerprint
        ? pendingRef.current
        : { requestId: newRequestId(), fingerprint };
    pendingRef.current = attempt;

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await logReading({ source, journalDate, requestId: attempt.requestId });
      pendingRef.current = null;
      close();
      setNotice(`Logged ${source.label}`);
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
      onLogged?.(journalDate);
    } catch (caught) {
      const message = caught instanceof Error && caught.message ? caught.message : "";
      setError(
        message.includes("Journal date") || message.includes("Source") || message.includes("source")
          ? "That reading couldn't be saved as entered."
          : "Your reading wasn't saved. Check your connection and try again."
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (options.length === 0) return null;

  return (
    <>
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={open}
          disabled={loading || disabled}
          aria-haspopup="dialog"
          aria-label={ariaLabel}
          title={ariaLabel}
          className={TRIGGER_CLASS[variant]}
        >
          <FontAwesomeIcon icon={faBook} className="h-3 w-3" aria-hidden="true" />
          {variant === "compact" && notice ? "Logged ✓" : label}
        </button>
        {/* The compact header control has no room for the confirmation; it is announced instead. */}
        <span
          role="status"
          className={variant === "compact" ? "sr-only" : "text-xs font-semibold text-[color:var(--foreground-muted)]"}
        >
          {notice}
        </span>
      </span>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        // React events bubble through portals and the top layer alike; keep the reader's swipe handlers out.
        onTouchStart={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
        className="m-auto w-[min(92vw,26rem)] rounded-[1.25rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] p-0 text-[color:var(--foreground)] shadow-[var(--surface-shadow-soft)] backdrop:bg-black/40"
      >
        <form
          className="space-y-4 p-5 font-sans text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <h2 id={titleId} className="font-display text-lg font-extrabold tracking-[-0.02em]">
            Log reading
          </h2>
          <p className="text-xs text-[color:var(--foreground-muted)]">
            Adds it to your private reading history. It doesn&apos;t mark a chapter read.
          </p>

          {choices.length > 1 ? (
            <fieldset className="space-y-1.5">
              <legend className="mb-1 font-bold">What you read</legend>
              {choices.map((option, index) => (
                <label key={`${option.source.href}-${index}`} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name={`${fieldId}-source`}
                    checked={choice === index}
                    onChange={() => {
                      setChoice(index);
                      setPart(false);
                    }}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-semibold">{option.source.label}</span>{" "}
                    <span className="text-xs text-[color:var(--foreground-muted)]">{sourceKindLabel(option.source)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : selected ? (
            <p>
              <span className="font-bold">What you read: </span>
              {selected.source.label}
            </p>
          ) : null}

          {partAllowed ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={part} onChange={(event) => setPart(event.target.checked)} />
                Only part of the chapter
              </label>
              {part ? (
                <div className="flex items-center gap-2">
                  <label htmlFor={`${fieldId}-start`}>Verses</label>
                  <input
                    id={`${fieldId}-start`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={selected.verseCount}
                    value={verseStart}
                    onChange={(event) => setVerseStart(event.target.value)}
                    className="h-9 w-20 rounded-lg border-2 border-[color:var(--surface-border)] bg-transparent px-2"
                  />
                  <label htmlFor={`${fieldId}-end`}>to</label>
                  <input
                    id={`${fieldId}-end`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={selected.verseCount}
                    value={verseEnd}
                    onChange={(event) => setVerseEnd(event.target.value)}
                    className="h-9 w-20 rounded-lg border-2 border-[color:var(--surface-border)] bg-transparent px-2"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1">
            <label htmlFor={`${fieldId}-date`} className="block font-bold">
              Day
            </label>
            <input
              id={`${fieldId}-date`}
              type="date"
              required
              value={journalDate}
              onChange={(event) => setJournalDate(event.target.value)}
              className="h-9 rounded-lg border-2 border-[color:var(--surface-border)] bg-transparent px-2"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm font-semibold text-[color:var(--accent-rubric)]">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className={TRIGGER_CLASS.pill}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !ready}
              className="inline-flex h-9 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 text-sm font-bold text-[color:var(--surface-button-active-text)] disabled:opacity-50"
            >
              {submitting ? "Saving…" : error ? "Try again" : "Log it"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
