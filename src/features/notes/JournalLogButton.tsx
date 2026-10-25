"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "@/lib/auth";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { isSafeSourceHref, localDateKey, newRequestId, type NoteSource } from "./journal";
import ReadingChip, { type ReadingDetails, type ReadingOption } from "./ReadingChip";
import { useConvexSignedIn } from "./useConvexSignedIn";
import { useJournalEntryActions } from "./useJournalEntryActions";
import { useBelowLg } from "./useBelowLg";

export type ReadingLogOption = ReadingOption;
type Props = {
  options: ReadingOption[];
  defaultDate?: string;
  followLocation?: boolean;
  variant?: "compact" | "pill" | "toolbar";
  presentation?: "dialog" | "reader-panel";
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onLogged?: (journalDate: string) => void;
};

const TRIGGER_CLASS = {
  compact: "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border surface-card-soft px-2.5 text-xs font-bold text-foreground hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 disabled:opacity-50",
  toolbar: "reader-toolbar-button reader-toolbar-log disabled:opacity-50",
  pill: "surface-button inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50",
};

function withLiveHref(source: NoteSource): NoteSource {
  const { pathname, search } = window.location;
  if (source.href.split(/[?#]/)[0] !== pathname) return source;
  const href = `${pathname}${search}`;
  return isSafeSourceHref(href) ? { ...source, href } : source;
}

export default function JournalLogButton({ options, defaultDate, followLocation = false, variant = "pill", presentation = "dialog", label = "Log", ariaLabel, disabled = false, onLogged }: Props) {
  const { promptSignIn } = useAuth();
  const { user, ready, loading } = useConvexSignedIn();
  const { createEntry } = useJournalEntryActions();
  const { closeBuilder } = useInsightBuilder();
  const belowLg = useBelowLg();
  const readerPanel = presentation === "reader-panel";
  const modal = !readerPanel || belowLg !== false;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const fieldId = useId();
  const [choices, setChoices] = useState(options);
  const [source, setSource] = useState<NoteSource | undefined>();
  const [reading, setReading] = useState<ReadingDetails | null>(null);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const [markdownBody, setMarkdownBody] = useState("");
  const [journalDate, setJournalDate] = useState(defaultDate ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const pending = useRef<{ requestId: string; fingerprint: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  useEffect(() => { pending.current = null; }, [user?.id]);
  // Desktop keeps the reader usable; phones use a modal sheet. Preserve the form when resizing.
  useEffect(() => {
    const panel = dialog.current;
    if (!isOpen || !panel) return;
    if (panel.open && panel.matches(":modal") === modal) return;
    if (panel.open) panel.close();
    if (modal) panel.showModal();
    else panel.show();
  }, [isOpen, modal]);
  useEffect(() => {
    if (isOpen && noteExpanded) noteInput.current?.focus();
  }, [isOpen, noteExpanded]);

  function close() {
    dialog.current?.close();
    setIsOpen(false);
    trigger.current?.focus();
  }

  function open() {
    if (!user) { void promptSignIn(); return; }
    if (isOpen) { dialog.current?.focus(); return; }
    if (!busy.current) {
      const live = options.map(option => followLocation ? { ...option, source: withLiveHref(option.source) } : option);
      const date = defaultDate ?? localDateKey();
      setChoices(live); setSource(live[0]?.source); setJournalDate(date);
      setReading(live[0] ? { source: live[0].source, journalDate: date } : null);
      setMarkdownBody(""); setNoteExpanded(false); setError(null);
    }
    if (readerPanel) closeBuilder();
    setIsOpen(true);
  }

  async function submit() {
    if (busy.current) return;
    if (!ready) { setError("Still connecting to your account. Try again in a moment."); return; }
    if (!reading && !markdownBody.trim()) { setError("Add a note or log reading."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(journalDate)) { setError("Choose a day for this entry."); return; }
    const input = { source: reading?.source ?? source, journalDate, markdownBody, logReading: !!reading };
    const fingerprint = JSON.stringify(input);
    const attempt = pending.current?.fingerprint === fingerprint ? pending.current : { requestId: newRequestId(), fingerprint };
    pending.current = attempt;
    busy.current = true; setSubmitting(true); setError(null);
    try {
      await createEntry({ ...input, requestId: attempt.requestId });
      pending.current = null; close(); setNotice("Entry saved");
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(null), 2600);
      onLogged?.(journalDate);
    } catch { setError("Your entry wasn't saved. Check your connection and try again."); }
    finally { busy.current = false; setSubmitting(false); }
  }

  return <>
    <span className="inline-flex items-center gap-2">
      <button ref={trigger} type="button" onClick={open} disabled={loading || disabled} aria-haspopup="dialog" aria-expanded={isOpen} aria-label={ariaLabel} title={ariaLabel} className={TRIGGER_CLASS[variant]}>
        <FontAwesomeIcon icon={faBook} className="h-3 w-3" aria-hidden="true" />
        <span className={variant === "toolbar" ? "reader-toolbar-log-label" : undefined}>{label}</span>
      </button>
      <span role="status" className={variant === "pill" ? "text-xs text-[color:var(--foreground-muted)]" : "sr-only"}>{notice}</span>
    </span>
    {isOpen ? createPortal(<dialog ref={dialog} aria-labelledby={titleId} aria-modal={modal} tabIndex={-1} data-reader-log={readerPanel ? "true" : undefined}
      onClose={() => { if (!dialog.current?.open) close(); }}
      onCancel={event => { event.preventDefault(); if (!busy.current) close(); }}
      onKeyDown={event => {
        if (event.key === "Escape" && !event.defaultPrevented && !busy.current) {
          event.preventDefault(); event.stopPropagation(); close();
        }
      }}
      onTouchStart={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()} onTouchEnd={event => event.stopPropagation()}
      className={`border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] p-5 text-[color:var(--foreground)] shadow-[var(--surface-shadow-soft)] overflow-hidden ${readerPanel
        ? "fixed inset-x-0 bottom-0 top-auto z-50 m-0 h-[80dvh] max-h-[90dvh] w-full max-w-none rounded-t-[1.25rem] backdrop:bg-black/30 lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-[calc(var(--header-height)+0.5rem)] lg:h-auto lg:max-h-none lg:w-[440px] lg:rounded-[20px] xl:w-[480px]"
        : "m-auto h-[min(80dvh,42rem)] max-h-[90dvh] w-[min(92vw,30rem)] rounded-[1.25rem] backdrop:bg-black/40"}`}>
      <form className="flex h-full min-h-0 flex-col" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <fieldset disabled={submitting} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 font-sans text-sm">
          <div className="flex shrink-0 items-center gap-2">
            <h2 id={titleId} className="min-w-0 flex-1 font-display text-base font-extrabold leading-tight tracking-[-0.02em] sm:text-lg">Log an entry</h2>
            <div className="max-w-[50%] shrink-0">
              <ReadingChip align="end" value={reading} options={choices} defaultDate={journalDate} disabled={submitting} onChange={value => {
                setReading(value);
                if (value) { setSource(value.source); setJournalDate(value.journalDate); }
              }} />
            </div>
            <button type="button" onClick={close} aria-label="Close log" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]">
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {noteExpanded ? <label htmlFor={`${fieldId}-note`} className="flex min-h-0 flex-1 flex-col">
            <span className="sr-only">Note (optional)</span>
            <textarea ref={noteInput} id={`${fieldId}-note`} value={markdownBody} onChange={event => setMarkdownBody(event.target.value)} placeholder="What would you like to remember?" rows={5} maxLength={200000} className="min-h-0 w-full flex-1 resize-none rounded-lg border-2 border-[color:var(--surface-border)] bg-transparent p-3 leading-relaxed" />
          </label> : <button type="button" onClick={() => setNoteExpanded(true)} className="surface-button inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]">
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
            Add note
          </button>}
          {error ? <p role="alert" className="shrink-0 text-sm font-semibold text-[color:var(--accent-rubric)]">{error}</p> : null}
          <div className="mt-auto flex shrink-0 items-end justify-between gap-3">
            <label htmlFor={`${fieldId}-date`} className="min-w-0 space-y-1 font-semibold">Day
              <input id={`${fieldId}-date`} type="date" required value={journalDate} onChange={event => {
                const date = event.target.value; setJournalDate(date); setReading(current => current ? { ...current, journalDate: date } : null);
              }} className="block h-9 max-w-full rounded-lg border-2 border-[color:var(--surface-border)] bg-transparent px-2 font-normal" />
            </label>
            <button type="submit" disabled={submitting || !ready} className="inline-flex h-9 shrink-0 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 text-sm font-bold text-[color:var(--surface-button-active-text)] disabled:opacity-50">{submitting ? "Saving…" : error ? "Try again" : "Save entry"}</button>
          </div>
        </fieldset>
      </form>
    </dialog>, document.body) : null}
  </>;
}
