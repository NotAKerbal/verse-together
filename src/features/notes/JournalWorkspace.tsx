"use client";

// Layout B of the Notes journal, purely presentational: every piece of data and every action arrives as a
// prop, so it renders the same under the app's connected adapter or a QA harness. It invents nothing; a day
// without entries is shown as empty.

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook, faChevronLeft, faChevronRight, faLightbulb, faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  entryKey,
  entryTime,
  formatDayHeading,
  formatMonthHeading,
  isSafeSourceHref,
  monthGrid,
  monthKeyOf,
  shiftMonth,
  weekOf,
  type JournalEntry,
} from "./journal";
import { NoteSourceLine } from "./NoteSourceLine";

export type JournalWorkspaceProps = {
  layout: "desktop" | "phone";
  /** "loading" until the journal query answers. */
  status: "loading" | "ready";
  entries: JournalEntry[];
  /** The viewer's local day, YYYY-MM-DD. */
  today: string;
  selectedDate: string;
  onSelectDate: (day: string) => void;
  /** entryKey() of the open entry. */
  selectedKey: string | null;
  onOpenNote: (noteId: string, journalDate: string) => void;
  onNewNote: (journalDate: string) => void;
  creating?: boolean;
  createError?: string | null;
  /** The open note's editor, which must belong to selectedDate: on the right (desktop) or first under the day (phone). */
  notePane?: ReactNode;
  /** Page-level controls shown beside the title (the account control). */
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
  showWeekday = false,
}: {
  day: string;
  counts: DayCounts | undefined;
  today: string;
  selected: boolean;
  onSelect: (day: string) => void;
  showWeekday?: boolean;
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
      className={`flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[0.8rem] border-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] ${
        selected
          ? "border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] text-[color:var(--surface-button-active-text)]"
          : isToday
            ? "border-[color:var(--accent-rubric)] hover:bg-[color:var(--surface-button-hover)]"
            : "border-transparent hover:bg-[color:var(--surface-button-hover)]"
      }`}
    >
      {showWeekday ? (
        <span aria-hidden="true" className="text-[0.62rem] font-semibold uppercase opacity-70">
          {WEEKDAYS[new Date(`${day}T12:00:00`).getDay()]}
        </span>
      ) : null}
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
}: {
  month: string;
  onMonth: (month: string) => void;
  countsByDay: Map<string, DayCounts>;
  today: string;
  selectedDate: string;
  onSelectDate: (day: string) => void;
}) {
  const cells = monthGrid(month);
  return (
    <section aria-label="Calendar" className="space-y-2">
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

function WeekStrip({
  countsByDay,
  today,
  selectedDate,
  onSelectDate,
}: {
  countsByDay: Map<string, DayCounts>;
  today: string;
  selectedDate: string;
  onSelectDate: (day: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1" role="group" aria-label="This week">
      {weekOf(selectedDate).map((day) => (
        <DayButton
          key={day}
          day={day}
          counts={countsByDay.get(day)}
          today={today}
          selected={day === selectedDate}
          onSelect={onSelectDate}
          showWeekday
        />
      ))}
    </div>
  );
}

function EntryRow({
  entry,
  selected,
  onOpenNote,
}: {
  entry: JournalEntry;
  selected: boolean;
  onOpenNote: (noteId: string, journalDate: string) => void;
}) {
  if (entry.kind === "reading") {
    return (
      <li className="rounded-[1rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] px-3 py-2.5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <FontAwesomeIcon icon={faBook} className="h-3.5 w-3.5 text-[color:var(--accent-secondary)]" aria-hidden="true" />
          <span>Reading</span>
          {isSafeSourceHref(entry.source.href) ? (
            <Link href={entry.source.href} className="min-w-0 truncate underline underline-offset-2">
              {entry.source.label}
            </Link>
          ) : (
            <span className="min-w-0 truncate">{entry.source.label}</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-[color:var(--foreground-muted)]">
          {entry.reader_label ? `Read by ${entry.reader_label} · ` : null}
          {entry.origin === "chapter_mark" || entry.origin === "legacy" ? "Chapter marked read" : "Logged"} at{" "}
          <time dateTime={entry.read_at}>{new Date(entry.read_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time>
        </p>
      </li>
    );
  }

  if (entry.kind === "verse_annotation") {
    return (
      <li className="rounded-[1rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] px-3 py-2.5">
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

  return (
    <li
      className={`rounded-[1rem] border-2 border-[color:var(--surface-border)] px-3 py-2.5 ${
        selected ? "bg-[color:var(--accent-note)] shadow-[var(--surface-shadow-soft)]" : "bg-[color:var(--surface-card)]"
      }`}
    >
      <button
        type="button"
        onClick={() => onOpenNote(entry.id, entry.journal_date)}
        aria-current={selected ? "true" : undefined}
        className="flex w-full items-start gap-2 rounded-[0.6rem] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
      >
        <FontAwesomeIcon icon={faLightbulb} className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[1rem] font-extrabold tracking-[-0.02em]">
            {entry.title || "Untitled note"}
          </span>
          {entry.excerpt ? (
            <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-[color:var(--foreground-muted)]">{entry.excerpt}</span>
          ) : null}
        </span>
        {entry.status !== "draft" ? (
          <span className="pill-tag shrink-0 px-2 py-0.5 text-[0.62rem]" style={{ background: "var(--accent-mint)" }}>
            {entry.status === "published" ? "Published" : "Archived"}
          </span>
        ) : null}
      </button>
      <div className="mt-1.5 pl-5">
        <NoteSourceLine source={entry.source} authorLabel={entry.author_label} time={entry.created_at} />
      </div>
    </li>
  );
}

export default function JournalWorkspace({
  layout,
  status,
  entries,
  today,
  selectedDate,
  onSelectDate,
  selectedKey,
  onOpenNote,
  onNewNote,
  creating = false,
  createError = null,
  notePane,
  headerAccessory,
  dayActions,
}: JournalWorkspaceProps) {
  const [month, setMonth] = useState(() => monthKeyOf(selectedDate));
  const [phoneMonthOpen, setPhoneMonthOpen] = useState(false);
  // Follow a selection made from outside (Today, opening a note from another day) to its month.
  const [followedDate, setFollowedDate] = useState(selectedDate);
  if (followedDate !== selectedDate) {
    setFollowedDate(selectedDate);
    setMonth(monthKeyOf(selectedDate));
  }

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

  const dayHeading = (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="w-full font-display text-xl font-extrabold tracking-[-0.02em]">
        <time dateTime={selectedDate}>{formatDayHeading(selectedDate)}</time>
        {selectedDate === today ? <span className="ml-2 text-sm font-bold text-[color:var(--accent-rubric)]">Today</span> : null}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onNewNote(selectedDate)} disabled={creating} className={PILL_BUTTON_CLASS}>
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
          {creating ? "Creating…" : "New note"}
        </button>
        {dayActions}
      </div>
    </div>
  );

  const dayError = createError ? (
    <p role="alert" className="text-sm font-semibold text-[color:var(--accent-rubric)]">
      {createError}
    </p>
  ) : null;

  const dayBody =
    status === "loading" ? (
        <p role="status" className="text-sm text-[color:var(--foreground-muted)]">
          Loading your journal…
        </p>
      ) : dayEntries.length === 0 ? (
        <div className="rounded-[1rem] border-2 border-dashed border-[color:var(--surface-border)] px-4 py-5 text-sm text-[color:var(--foreground-muted)]">
          <p>Nothing recorded on this day.</p>
          <p className="mt-1">
            Start a note here, or read in{" "}
            <Link href="/browse" className="font-semibold underline underline-offset-2">
              Browse
            </Link>{" "}
            or{" "}
            <Link href="/come-follow-me" className="font-semibold underline underline-offset-2">
              Come, Follow Me
            </Link>{" "}
            and write from there.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {dayEntries.map((entry) => (
            <EntryRow key={entryKey(entry)} entry={entry} selected={entryKey(entry) === selectedKey} onOpenNote={onOpenNote} />
          ))}
        </ul>
      );

  const dayList = (
    <section aria-label={`Entries for ${formatDayHeading(selectedDate)}`} className="space-y-3">
      {dayHeading}
      {dayError}
      {dayBody}
    </section>
  );

  const title = (
    <div className="flex items-center justify-between gap-3">
      <h1 className="flex min-w-0 items-center gap-2.5 px-1 font-display text-[1.6rem] font-extrabold tracking-[-0.03em] sm:text-[1.9rem]">
        Notes
      </h1>
      {headerAccessory}
    </div>
  );

  if (layout === "phone") {
    // The open note comes straight after the day heading so the editor isn't buried under the day's cards.
    return (
      <div className="flex min-h-[calc(100dvh-var(--header-height,0px)-9rem)] flex-col gap-4">
        {title}
        <div className="space-y-2">
          {phoneMonthOpen ? (
            <MonthCalendar
              month={month}
              onMonth={setMonth}
              countsByDay={countsByDay}
              today={today}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
            />
          ) : (
            <WeekStrip countsByDay={countsByDay} today={today} selectedDate={selectedDate} onSelectDate={onSelectDate} />
          )}
          <div className="flex items-center justify-between gap-2">
            {phoneMonthOpen ? <span /> : <Legend />}
            <button
              type="button"
              onClick={() => setPhoneMonthOpen((open) => !open)}
              aria-expanded={phoneMonthOpen}
              className="text-xs font-bold underline underline-offset-2"
            >
              {phoneMonthOpen ? "Show week" : "Show month"}
            </button>
          </div>
        </div>
        <section aria-label={`Entries for ${formatDayHeading(selectedDate)}`} className="space-y-3">
          {dayHeading}
          {dayError}
          {notePane ? (
            <section aria-label="Open note" className="panel-card flex min-h-[60dvh] flex-col rounded-[20px] p-4">
              {notePane}
            </section>
          ) : null}
          {notePane && dayEntries.length > 0 ? (
            <h3 className="pt-1 text-xs font-bold uppercase tracking-[0.06em] text-[color:var(--foreground-soft)]">
              Also on this day
            </h3>
          ) : null}
          {dayBody}
        </section>
      </div>
    );
  }

  // Layout B: the month and the selected day's activity share the left rail; the open note gets the rest.
  return (
    <div className="space-y-4">
      {title}
      <div className="grid min-h-0 gap-5 lg:h-[calc(100vh-var(--header-height)-7.5rem)] lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-h-0 space-y-5 lg:overflow-y-auto lg:pr-1">
          <MonthCalendar
            month={month}
            onMonth={setMonth}
            countsByDay={countsByDay}
            today={today}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
          />
          {dayList}
        </aside>
        <section
          aria-label="Open note"
          className="panel-card flex min-h-[24rem] flex-col overflow-y-auto rounded-[20px] p-5 lg:min-h-0"
        >
          {notePane ?? (
            <p className="m-auto max-w-xs text-center text-sm text-[color:var(--foreground-muted)]">
              {dayEntries.some((entry) => entry.kind === "note")
                ? "Choose a note from this day, or start a new one."
                : "Start a note for this day."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
