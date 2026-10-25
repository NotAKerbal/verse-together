"use client";

// Layout B of the Notes journal, purely presentational: every piece of data and every action arrives as a
// prop, so it renders the same under the app's connected adapter or a QA harness. It invents nothing; a day
// without entries is shown as empty. On a phone the calendar, a day's entries and the open note are separate
// screens (stages); on desktop the calendar stays beside a main area showing the day's chooser, and opening a
// note moves that same chooser into the calendar's place (JournalWorkspace.module.css animates the move).

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook, faChevronLeft, faChevronRight, faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  entryKey,
  entryTime,
  formatDayHeading,
  formatMonthHeading,
  formatShortDayHeading,
  isSafeSourceHref,
  monthGrid,
  monthKeyOf,
  shiftMonth,
  type JournalEntry,
} from "./journal";
import type { JournalStage } from "./journalView";
import { NoteSourceLine } from "./NoteSourceLine";
import { JournalNoteCard } from "./JournalNoteCard";
import styles from "./JournalWorkspace.module.css";

export type JournalWorkspaceProps = {
  layout: "desktop" | "phone";
  /** "loading" until the journal query answers. */
  status: "loading" | "ready";
  entries: JournalEntry[];
  /** The viewer's local day, YYYY-MM-DD. */
  today: string;
  /** What is in view: the calendar, the selected day's chooser, or an open note (see journalView.ts). */
  stage: JournalStage;
  selectedDate: string;
  onSelectDate: (day: string) => void;
  /** entryKey() of the open entry. */
  selectedKey: string | null;
  onOpenNote: (noteId: string, journalDate: string) => void;
  /** Leaves the open note for its day's chooser; the note itself is untouched. */
  onCloseNote: () => void;
  /** Phone: back from a day's entries to the calendar. */
  onShowCalendar: () => void;
  onNewNote: (journalDate: string) => void;
  creating?: boolean;
  createError?: string | null;
  /** The open note's editor, shown while stage is "note"; it must belong to selectedDate. */
  notePane?: ReactNode;
  /** Phone page-level controls at the top right (the account control). Desktop leaves the account to the app header. */
  headerAccessory?: ReactNode;
  /** Extra actions beside "New note" for the selected day (the reading-log control). */
  dayActions?: ReactNode;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PILL_BUTTON_CLASS =
  "surface-button inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50";
const ICON_BUTTON_CLASS =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]";

type DayCounts = { notes: number; readings: number };

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function dayLabel(day: string, counts: DayCounts | undefined, today: string) {
  const parts = [formatDayHeading(day)];
  if (day === today) parts.push("today");
  if (counts?.notes) parts.push(plural(counts.notes, "note", "notes"));
  if (counts?.readings) parts.push(plural(counts.readings, "reading", "readings"));
  if (!counts?.notes && !counts?.readings) parts.push("nothing recorded");
  return parts.join(", ");
}

function DayButton({
  day,
  counts,
  today,
  selected,
  onSelect,
  compact,
}: {
  day: string;
  counts: DayCounts | undefined;
  today: string;
  selected: boolean;
  onSelect: (day: string) => void;
  compact: boolean;
}) {
  const isToday = day === today;
  const dayNumber = Number(day.slice(8, 10));
  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      aria-pressed={selected}
      aria-current={isToday ? "date" : undefined}
      aria-label={dayLabel(day, counts, today)}
      className={`flex ${compact ? "h-9" : "h-12"} min-w-0 flex-col items-center justify-center gap-0.5 rounded-[0.8rem] border-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] ${
        selected
          ? "border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] text-[color:var(--surface-button-active-text)]"
          : isToday
            ? "border-[color:var(--accent-rubric)] hover:bg-[color:var(--surface-button-hover)]"
            : "border-transparent hover:bg-[color:var(--surface-button-hover)]"
      }`}
    >
      <span aria-hidden="true">{dayNumber}</span>
      <span aria-hidden="true" className="flex h-1.5 items-center gap-1">
        {counts?.notes ? <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent-primary)] ring-1 ring-[color:var(--surface-border)]" /> : null}
        {counts?.readings ? <span className="h-1.5 w-1.5 rounded-[1px] bg-[color:var(--accent-secondary)]" /> : null}
      </span>
    </button>
  );
}

function Legend() {
  return (
    <p className="flex items-center gap-3 text-[0.7rem] text-[color:var(--foreground-muted)]">
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[color:var(--accent-primary)] ring-1 ring-[color:var(--surface-border)]" />
        Notes
      </span>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true" className="h-2 w-2 rounded-[1px] bg-[color:var(--accent-secondary)]" />
        Reading
      </span>
    </p>
  );
}

function MonthCalendar({
  month,
  onMonth,
  countsByDay,
  today,
  selectedDate,
  onSelectDate,
  compact,
}: {
  month: string;
  onMonth: (month: string) => void;
  countsByDay: Map<string, DayCounts>;
  today: string;
  selectedDate: string;
  onSelectDate: (day: string) => void;
  /** Desktop's shorter day cells, so the rest of the page sits higher. */
  compact: boolean;
}) {
  const cells = monthGrid(month);
  return (
    // A card like the chooser's and the note's (the phone's is p-4, as its note is), sized to the month.
    <section aria-label="Calendar" className={`panel-card space-y-1.5 rounded-[20px] ${compact ? "p-5" : "p-4"}`}>
      <div className="flex items-center gap-1.5">
        <h2 className="min-w-0 flex-1 font-display text-lg font-extrabold tracking-[-0.02em]" aria-live="polite">
          {formatMonthHeading(month)}
        </h2>
        <button type="button" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month" className={ICON_BUTTON_CLASS}>
          <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            onMonth(monthKeyOf(today));
            onSelectDate(today);
          }}
          className={PILL_BUTTON_CLASS}
        >
          Today
        </button>
        <button type="button" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Next month" className={ICON_BUTTON_CLASS}>
          <FontAwesomeIcon icon={faChevronRight} className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {/* Each day button carries its full date and counts as its accessible name. */}
      <div role="group" aria-label={`Days of ${formatMonthHeading(month)}`} className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((label, index) => (
          <span
            key={WEEKDAY_NAMES[index]}
            aria-hidden="true"
            className="text-center text-[0.68rem] font-bold uppercase text-[color:var(--foreground-soft)]"
          >
            {label}
          </span>
        ))}
        {cells.map((day, index) =>
          day ? (
            <DayButton
              key={day}
              day={day}
              counts={countsByDay.get(day)}
              today={today}
              selected={day === selectedDate}
              onSelect={onSelectDate}
              compact={compact}
            />
          ) : (
            <span key={`blank-${index}`} aria-hidden="true" />
          )
        )}
      </div>
      <Legend />
    </section>
  );
}

function EntryRow({
  entry,
  selected,
  onOpenNote,
  prominent,
}: {
  entry: JournalEntry;
  selected: boolean;
  onOpenNote: (noteId: string, journalDate: string) => void;
  /** The chooser's larger cards, which every list uses today; false gives a compact list. */
  prominent: boolean;
}) {
  const padding = prominent ? "px-4 py-3" : "px-3 py-2.5";
  if (entry.kind === "reading") {
    const linked = isSafeSourceHref(entry.source.href);
    const reading = (
      <>
        <span className="flex items-center gap-2 text-sm font-bold">
          <FontAwesomeIcon icon={faBook} className="h-3.5 w-3.5 text-[color:var(--accent-secondary)]" aria-hidden="true" />
          <span>Reading</span>
          <span className={`min-w-0 truncate ${linked ? "underline underline-offset-2" : ""}`}>{entry.source.label}</span>
        </span>
        <span className="mt-0.5 block text-xs text-[color:var(--foreground-muted)]">
          {entry.reader_label ? `Read by ${entry.reader_label} · ` : null}
          {entry.origin === "chapter_mark" || entry.origin === "legacy" ? "Chapter marked read" : "Logged"} at{" "}
          <time dateTime={entry.read_at}>{new Date(entry.read_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time>
        </span>
      </>
    );
    // The whole card is the link back to what was read; a source that can't be linked safely stays plain text.
    return linked ? (
      <li>
        <Link
          href={entry.source.href}
          className={`block rounded-[1rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] transition-[background-color,border-color,box-shadow] hover:bg-[color:var(--surface-button-hover)] hover:shadow-[var(--surface-shadow-lift)] focus-visible:border-[color:var(--accent-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] ${padding}`}
        >
          {reading}
        </Link>
      </li>
    ) : (
      <li className={`rounded-[1rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] ${padding}`}>{reading}</li>
    );
  }

  if (entry.kind === "verse_annotation") {
    return (
      <li className={`rounded-[1rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] ${padding}`}>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.06em] text-[color:var(--foreground-soft)]">
          Verse note · read-only here
        </p>
        <p className="mt-1 line-clamp-4 whitespace-pre-wrap font-serif text-[0.98rem] leading-relaxed">{entry.body}</p>
        <div className="mt-1.5">
          <NoteSourceLine source={entry.source} authorLabel={entry.author_label} time={entry.created_at} verb="Noted" />
        </div>
      </li>
    );
  }

  return <JournalNoteCard note={entry} selected={selected} onOpen={() => onOpenNote(entry.id, entry.journal_date)} prominent={prominent} />;
}

function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="-ml-2 inline-flex h-10 min-w-0 items-center gap-1.5 rounded-full px-2 text-sm font-bold hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
    >
      <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">Back to </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * Moves focus to the new stage's landmark when a stage change took focus away with it: the control that was
 * pressed is gone, now inert (desktop keeps the month and the note's panel mounted), or sits in `moved`, the
 * desktop chooser that changes place rather than unmounting. On a phone it also starts the new screen at its
 * top. Focus elsewhere that survived is left alone.
 */
function useStageFocus(
  stageKey: string,
  scrollToTop: boolean,
  target: RefObject<HTMLElement | null>,
  moved: RefObject<HTMLElement | null>
) {
  const shownKey = useRef(stageKey);
  useEffect(() => {
    if (shownKey.current === stageKey) return;
    shownKey.current = stageKey;
    if (scrollToTop) window.scrollTo({ top: 0 });
    const focused = document.activeElement;
    const stranded =
      !focused || focused === document.body || focused.closest("[inert]") !== null || moved.current?.contains(focused);
    if (!stranded) return;
    target.current?.focus({ preventScroll: true });
  }, [stageKey, scrollToTop, target, moved]);
}

export default function JournalWorkspace({
  layout,
  status,
  entries,
  today,
  stage,
  selectedDate,
  onSelectDate,
  selectedKey,
  onOpenNote,
  onCloseNote,
  onShowCalendar,
  onNewNote,
  creating = false,
  createError = null,
  notePane,
  headerAccessory,
  dayActions,
}: JournalWorkspaceProps) {
  const [month, setMonth] = useState(() => monthKeyOf(selectedDate));
  // Follow a selection made from outside (Today, opening a note from another day) to its month.
  const [followedDate, setFollowedDate] = useState(selectedDate);
  if (followedDate !== selectedDate) {
    setFollowedDate(selectedDate);
    setMonth(monthKeyOf(selectedDate));
  }

  const isPhone = layout === "phone";
  const noteOpen = stage === "note" && notePane != null;
  const focusTarget = useRef<HTMLElement | null>(null);
  const setFocusTarget = useCallback((element: HTMLElement | null) => {
    focusTarget.current = element;
  }, []);
  const chooserRegion = useRef<HTMLElement | null>(null);
  const chooserScroll = useRef<HTMLDivElement | null>(null);
  const chooserHeadingId = useId();
  // Desktop shows the same chooser for "calendar" and "day", so only opening or closing a note changes it.
  useStageFocus(isPhone ? stage : noteOpen ? "note" : "chooser", isPhone, focusTarget, chooserRegion);
  // The desktop chooser outlives opening and closing a note, and so would its scroll: focusing a card low in the
  // list can scroll it into view first, leaving the rail's back button and date above sight. Start each place at its
  // top, as when each had its own list; before paint, so the moved chooser never shows the old position.
  useLayoutEffect(() => {
    if (chooserScroll.current) chooserScroll.current.scrollTop = 0;
  }, [noteOpen]);

  const countsByDay = useMemo(() => {
    const map = new Map<string, DayCounts>();
    for (const entry of entries) {
      const counts = map.get(entry.journal_date) ?? { notes: 0, readings: 0 };
      if (entry.kind === "reading") counts.readings += 1;
      else counts.notes += 1;
      map.set(entry.journal_date, counts);
    }
    return map;
  }, [entries]);

  const dayEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.journal_date === selectedDate)
        .sort((a, b) => entryTime(a).localeCompare(entryTime(b))),
    [entries, selectedDate]
  );
  const dayName = formatDayHeading(selectedDate);
  const isToday = selectedDate === today;

  const todayTag = isToday ? <span className="ml-2 text-sm font-bold text-[color:var(--accent-rubric)]">Today</span> : null;

  const dayButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onNewNote(selectedDate)} disabled={creating} className={PILL_BUTTON_CLASS}>
        <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
        {creating ? "Creating…" : "New note"}
      </button>
      {dayActions}
    </div>
  );

  const dayError = createError ? (
    <p role="alert" className="text-sm font-semibold text-[color:var(--accent-rubric)]">
      {createError}
    </p>
  ) : null;

  function dayBody(prominent: boolean) {
    if (status === "loading") {
      return (
        <p role="status" className="text-sm text-[color:var(--foreground-muted)]">
          Loading your journal…
        </p>
      );
    }
    if (dayEntries.length === 0) return null;
    return (
      <ul className={prominent ? "space-y-2.5" : "space-y-2"}>
        {dayEntries.map((entry) => (
          <EntryRow
            key={entryKey(entry)}
            entry={entry}
            selected={entryKey(entry) === selectedKey}
            onOpenNote={onOpenNote}
            prominent={prominent}
          />
        ))}
      </ul>
    );
  }

  // The selected day's entries as the main content: where a closed note leaves you, on a phone or desktop.
  const chooserHeader = (
    <h2
      id={chooserHeadingId}
      ref={setFocusTarget}
      tabIndex={-1}
      className="font-display text-xl font-extrabold tracking-[-0.02em] focus:outline-none"
    >
      <time dateTime={selectedDate}>{dayName}</time>
      {todayTag}
    </h2>
  );


  const openNoteSection = (className: string) => (
    <section
      aria-label="Open note"
      ref={setFocusTarget}
      tabIndex={-1}
      className={`panel-card flex flex-col rounded-[20px] focus:outline-none ${className}`}
    >
      {notePane}
    </section>
  );

  // The app header already names the page, so this heading is for screen readers only. It is still where focus
  // lands on returning to the phone calendar.
  const title = (
    <h1 className="sr-only" ref={isPhone && stage === "calendar" ? setFocusTarget : undefined} tabIndex={-1}>
      Notes
    </h1>
  );

  if (isPhone) {
    // One screen per stage: calendar, then a day's entries, then the note. Nothing is stacked under the editor.
    const back = noteOpen ? (
      <BackButton label={dayName} onBack={onCloseNote} />
    ) : stage === "day" ? (
      <BackButton label="Calendar" onBack={onShowCalendar} />
    ) : null;
    return (
      <div className="flex flex-col gap-3">
        {title}
        {back || headerAccessory ? (
          <div className={`flex items-center gap-3 ${back ? "min-h-10 justify-between" : "justify-end sm:hidden"}`}>
            {back}
            {headerAccessory}
          </div>
        ) : null}
        {noteOpen ? (
          openNoteSection("min-h-[60dvh] p-4")
        ) : stage === "day" ? (
          <section aria-labelledby={chooserHeadingId} className="space-y-3">
            <div className="space-y-2">
              {chooserHeader}
              {dayButtons}
            </div>
            {dayError}
            {dayBody(true)}
          </section>
        ) : (
          <MonthCalendar
            month={month}
            onMonth={setMonth}
            countsByDay={countsByDay}
            today={today}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            compact={false}
          />
        )}
      </div>
    );
  }

  // Layout B: the month in the left rail; the main area holds the selected day's chooser. Opening a note moves
  // that same chooser (one element, so its controls and scroll survive) into the rail, to switch notes without
  // closing; closing moves it back and restores the month. Whatever is out of view is inert.
  return (
    <div>
      {title}
      <div
        data-note-open={noteOpen ? "" : undefined}
        className={`${styles.stage} min-h-0 lg:h-[calc(100dvh-var(--header-height)-3.1rem)] lg:min-h-[30rem]`}
      >
        <div className={styles.calendar} inert={noteOpen}>
          <MonthCalendar
            month={month}
            onMonth={setMonth}
            countsByDay={countsByDay}
            today={today}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            compact
          />
        </div>
        <section
          ref={chooserRegion}
          aria-labelledby={noteOpen ? undefined : chooserHeadingId}
          aria-label={noteOpen ? `Entries for ${dayName}` : undefined}
          className={styles.chooser}
        >
          <div aria-hidden="true" className={`panel-card rounded-[20px] ${styles.chooserCard}`} />
          <div ref={chooserScroll} className={`space-y-3 ${styles.chooserScroll}`}>
            <div className="space-y-2">
              {noteOpen ? (
                <div className="flex items-center gap-2">
                  {/* Same as the note's X: back to the month and this day's chooser. */}
                  <button
                    type="button"
                    onClick={onCloseNote}
                    aria-label="Back to calendar"
                    title="Back to calendar"
                    className={`${ICON_BUTTON_CLASS} shrink-0`}
                  >
                    <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  {/* The rail is narrow, so the date is abbreviated on screen; its accessible name stays the full date.
                      The date and "Today" each stay whole and wrap as units rather than stranding the year. */}
                  <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-display text-lg font-extrabold tracking-[-0.02em]">
                    <time dateTime={selectedDate} title={dayName} className="whitespace-nowrap">
                      <span aria-hidden="true">{formatShortDayHeading(selectedDate)}</span>
                      <span className="sr-only">{dayName}</span>
                    </time>
                    {isToday ? <span className="text-sm font-bold text-[color:var(--accent-rubric)]">Today</span> : null}
                  </h2>
                </div>
              ) : (
                chooserHeader
              )}
              {dayButtons}
            </div>
            {dayError}
            {dayBody(true)}
          </div>
        </section>
        <section
          aria-label="Open note"
          ref={noteOpen ? setFocusTarget : undefined}
          tabIndex={-1}
          inert={!noteOpen}
          className={`panel-card flex flex-col overflow-y-auto rounded-[20px] p-5 focus:outline-none ${styles.note}`}
        >
          {noteOpen ? notePane : null}
        </section>
      </div>
    </div>
  );
}
