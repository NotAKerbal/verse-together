import { dateFromKey, entryTime, localDateKey, monthKeyOf, type JournalEntry, type JournalNoteEntry } from "./journal";

export const REFLECTION_PROMPTS = [
  "What is one thing you want to carry with you from your study?",
  "Where did you notice a little light in your day?",
  "What invitation could you put into practice this week?",
  "What question would you like to bring to your next study?",
  "What helped you feel closer to God?",
  "Which verse would you like to remember tomorrow, and why?",
  "Where have you seen the Lord’s hand in your life recently?",
  "What are you grateful for today?",
  "Who could you serve or encourage this week?",
  "What promise in the scriptures gives you hope right now?",
  "What is on your heart that you would like to bring to the Lord?",
  "What did your reading teach you about Jesus Christ?",
  "What small change would help you follow Christ more fully?",
  "When did you feel peace today?",
  "What prayer has been answered, even in a small way?",
  "What word or phrase stood out to you, and what might it mean for you?",
  "What could you share with someone you love from what you learned?",
  "What does your study teach you about who God is?",
  "Where would you like more faith or patience right now?",
] as const;

export const JOURNAL_INVITATION_ART = [
  { src: "/art/journal-dawn.webp", position: "center" },
  { src: "/art/browse-come-follow-me.webp", position: "center 62%" },
  { src: "/art/browse-newtestament.webp", position: "center 68%" },
  { src: "/art/browse-oldtestament.webp", position: "center 42%" },
  { src: "/art/browse-pearl.webp", position: "center 55%" },
  { src: "/art/browse-doctrineandcovenants.webp", position: "center 40%" },
] as const;

export type JournalInvitationChoice = { prompt: number; art: number };
export type StoredJournalInvitation = { prompt: string; art: string };

export function randomIndexExcept(length: number, excluded: number | null | undefined, random: () => number = Math.random) {
  if (length <= 1) return 0;
  const avoid = typeof excluded === "number" && Number.isInteger(excluded) && excluded >= 0 && excluded < length;
  const span = avoid ? length - 1 : length;
  const index = Math.min(span - 1, Math.max(0, Math.floor(random() * span) || 0));
  return avoid && index >= excluded ? index + 1 : index;
}

export function pickJournalInvitation(previous: Partial<JournalInvitationChoice> | null, random: () => number = Math.random): JournalInvitationChoice {
  return {
    prompt: randomIndexExcept(REFLECTION_PROMPTS.length, previous?.prompt, random),
    art: randomIndexExcept(JOURNAL_INVITATION_ART.length, previous?.art, random),
  };
}

export function storedJournalInvitation(choice: JournalInvitationChoice): StoredJournalInvitation {
  return { prompt: REFLECTION_PROMPTS[choice.prompt], art: JOURNAL_INVITATION_ART[choice.art].src };
}

export function journalInvitationFromStored(value: unknown): Partial<JournalInvitationChoice> | null {
  if (!value || typeof value !== "object") return null;
  const { prompt, art } = value as Partial<Record<keyof StoredJournalInvitation, unknown>>;
  const promptIndex = REFLECTION_PROMPTS.findIndex(text => text === prompt);
  const artIndex = JOURNAL_INVITATION_ART.findIndex(item => item.src === art);
  return {
    ...(promptIndex >= 0 ? { prompt: promptIndex } : {}),
    ...(artIndex >= 0 ? { art: artIndex } : {}),
  };
}

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
