import { dateFromKey, entryTime, localDateKey, monthKeyOf, type JournalEntry, type JournalNoteEntry } from "./journal";

export const REFLECTION_PROMPTS = [
  "What is one thing you want to carry with you from your study?",
  "Where did you notice a little light in your day?",
  "What invitation could you put into practice this week?",
  "What question would you like to bring to your next study?",
  "What helped you feel closer to God?",
] as const;

/** Weekly goals run Monday–Sunday, independently of the Sunday-first month calendar. */
export function journalGoalWeek(today: string) {
  const start = dateFromKey(today);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: localDateKey(start), end: localDateKey(end) };
}

export function hasReflection(entry: JournalEntry): entry is JournalNoteEntry {
  return entry.kind === "note" && (entry.has_reflection ??
    (!!entry.excerpt?.trim() || (!!entry.title.trim() && entry.title !== "Untitled note")));
}

export function journalHomeProgress(entries: JournalEntry[], today: string) {
  const week = journalGoalWeek(today);
  const month = monthKeyOf(today);
  const weeklyReadingDays = new Set<string>();
  const monthlyReadingDays = new Set<string>();
  const seen = new Set<string>();
  let reflections = 0;
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key) || entry.journal_date > today) continue;
    seen.add(key);
    const inWeek = entry.journal_date >= week.start && entry.journal_date <= week.end;
    if (entry.kind === "reading" || (entry.kind === "note" && entry.reading_at)) {
      if (inWeek) weeklyReadingDays.add(entry.journal_date);
      if (monthKeyOf(entry.journal_date) === month) monthlyReadingDays.add(entry.journal_date);
    }
    if (inWeek && hasReflection(entry)) reflections += 1;
  }
  return { week, studyDays: weeklyReadingDays.size, reflections, monthStudyDays: monthlyReadingDays.size };
}

/** Resurface a real earlier reflection, never a reading-only entry or an invented quote. */
export function journalRevisit(entries: JournalEntry[], before: string): JournalNoteEntry | null {
  let latest: JournalNoteEntry | null = null;
  for (const entry of entries) {
    if (!hasReflection(entry) || entry.journal_date >= before) continue;
    if (!latest || entry.journal_date > latest.journal_date ||
      (entry.journal_date === latest.journal_date && entryTime(entry) > entryTime(latest))) latest = entry;
  }
  return latest;
}
