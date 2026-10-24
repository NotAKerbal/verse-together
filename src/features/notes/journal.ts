// Client-side shapes and date helpers for the Notes journal. The server rules live in convex/noteJournal.ts;
// only its types are imported here so no validator code reaches the browser bundle.

import type { NoteSource } from "../../../convex/noteJournal";

export type { NoteSource };

export type JournalNoteStatus = "draft" | "published" | "archived";

/** One row of insights:listMyJournal with kind "note". */
export type JournalNoteEntry = {
  kind: "note";
  id: string;
  title: string;
  status: JournalNoteStatus;
  journal_date: string;
  source: NoteSource | null;
  excerpt: string | null;
  markdown_revision: number;
  markdown_canonical: boolean;
  read_only: false;
  author_label: string;
  created_at: string;
  updated_at: string;
};

/** One row of insights:listMyJournal with kind "verse_annotation": an older verse note, shown read-only. */
export type JournalAnnotationEntry = {
  kind: "verse_annotation";
  id: string;
  title: null;
  body: string;
  journal_date: string;
  source: NoteSource;
  highlight_color: string | null;
  read_only: true;
  author_label: string;
  created_at: string;
  updated_at: string;
};

/** One row of readingProgress:listMyReadingLog, as it comes from the server. */
export type ReadingLogRow = {
  id: string;
  kind: "log" | "legacy_chapter_read";
  origin: "chapter_mark" | "manual" | "legacy";
  source: NoteSource;
  journal_date: string;
  read_at: string;
  created_at: string;
  request_id: string | null;
};

/** A logged reading, mapped from a ReadingLogRow. */
export type JournalReadingEntry = {
  kind: "reading";
  id: string;
  journal_date: string;
  source: NoteSource;
  read_at: string;
  origin?: ReadingLogRow["origin"];
  /** Who read it: always the signed-in viewer, since the log is private. */
  reader_label?: string;
};

export function readingEntryFromRow(row: ReadingLogRow, readerLabel: string): JournalReadingEntry {
  return {
    kind: "reading",
    id: row.id,
    journal_date: row.journal_date,
    source: row.source,
    read_at: row.read_at,
    origin: row.origin,
    reader_label: readerLabel,
  };
}

/** A client request id for an idempotent mutation (matches the server's [A-Za-z0-9_.:-] rule). */
export function newRequestId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `rl-${random}`;
}

export type JournalEntry = JournalNoteEntry | JournalAnnotationEntry | JournalReadingEntry;

/** The full note as getDraft returns it, reduced to what the Markdown editor needs. */
export type JournalNoteDocument = {
  id: string;
  title: string;
  status: JournalNoteStatus;
  markdown_body: string;
  markdown_revision: number;
  markdown_canonical: boolean;
  journal_date: string;
  source: NoteSource | null;
  created_at: string;
  updated_at: string;
};

export function entryKey(entry: JournalEntry): string {
  return `${entry.kind}:${entry.id}`;
}

export function entryTime(entry: JournalEntry): string {
  return entry.kind === "reading" ? entry.read_at : entry.created_at;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** YYYY-MM-DD for the viewer's own calendar day (not UTC). */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A YYYY-MM-DD key as a local Date at midnight. */
export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** "2026-10" for the month containing a day key. */
export function monthKeyOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** Day keys for a Sunday-first month grid, padded with null outside the month. */
export function monthGrid(monthKey: string): Array<string | null> {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<string | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(`${year}-${pad(month)}-${pad(day)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** The seven day keys of the Sunday-first week containing a day. */
export function weekOf(dayKey: string): string[] {
  const start = dateFromKey(dayKey);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return localDateKey(day);
  });
}

export function formatDayHeading(dayKey: string): string {
  return dateFromKey(dayKey).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** The same day abbreviated ("Fri, Oct 23, 2026"), for narrow places such as the desktop rail. */
export function formatShortDayHeading(dayKey: string): string {
  return dateFromKey(dayKey).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMonthHeading(monthKey: string): string {
  return dateFromKey(`${monthKey}-01`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Same rule as the server: a page in this app, no scheme, no "//", no controls or whitespace. */
export function isSafeSourceHref(href: string): boolean {
  if (!href || href.length > 2048) return false;
  if (/[\u0000-\u001f\u007f-\u009f\s\\‎‏‪-‮⁦-⁩]/.test(href)) return false;
  return href.startsWith("/") && !href.startsWith("//");
}

export function sourceKindLabel(source: NoteSource): string {
  return source.kind === "scripture" ? "Scripture" : source.kind === "guide" ? "Come, Follow Me" : "Page";
}
