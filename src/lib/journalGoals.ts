export type JournalGoals = { studyDays: number; reflections: number };

export const DEFAULT_JOURNAL_GOALS: Readonly<JournalGoals> = { studyDays: 5, reflections: 3 };
export const MAX_WEEKLY_REFLECTIONS = 21;

export function journalGoalsProblem(goals: JournalGoals): string | null {
  if (!Number.isInteger(goals.studyDays) || goals.studyDays < 1 || goals.studyDays > 7) {
    return "Choose between 1 and 7 study days per week.";
  }
  if (!Number.isInteger(goals.reflections) || goals.reflections < 1 || goals.reflections > MAX_WEEKLY_REFLECTIONS) {
    return `Choose between 1 and ${MAX_WEEKLY_REFLECTIONS} reflections per week.`;
  }
  return null;
}
