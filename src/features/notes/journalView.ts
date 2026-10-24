// Which day and note the Notes page is showing. This is display state only: closing a note here never
// deletes it or changes which note the reader's sidebar writes into. Once the person chooses anything, the
// view is theirs and later data updates (a restored or reactive active note) never reopen a note on its own.

/** On a phone each stage is its own screen; on desktop "calendar" and "day" both show the day's chooser. */
export type JournalStage = "calendar" | "day" | "note";

export type JournalView =
  | { stage: "calendar" | "day"; date: string; noteId: null }
  | { stage: "note"; date: string; noteId: string };

/** null until the person chooses something: the page then follows the active note they arrived with. */
export type JournalViewState = JournalView | null;

export type JournalViewContext = {
  today: string;
  /** The provider's active note, the only note whose document is loaded. */
  activeNoteId: string | null;
  /** That note's journal day, once known. */
  activeNoteDate: string | null;
};

export type JournalViewAction =
  | { type: "selectDate"; date: string }
  | { type: "openNote"; noteId: string; date: string }
  | { type: "closeNote" }
  | { type: "showCalendar" };

/** The concrete view to render for the current state and data. */
export function resolveJournalView(state: JournalViewState, context: JournalViewContext): JournalView {
  if (state === null) {
    // Arriving with a current note (say, from the reader's sidebar) opens it on its own day.
    if (context.activeNoteId && context.activeNoteDate) {
      return { stage: "note", date: context.activeNoteDate, noteId: context.activeNoteId };
    }
    return { stage: "calendar", date: context.today, noteId: null };
  }
  // A chosen note that is no longer the loaded one (deleted, or switched elsewhere) leaves its day's chooser.
  if (state.stage === "note" && state.noteId !== context.activeNoteId) {
    return { stage: "day", date: state.date, noteId: null };
  }
  return state;
}

/** The view after a person's action, from the view they were looking at. */
export function nextJournalView(view: JournalView, action: JournalViewAction): JournalView {
  switch (action.type) {
    case "selectDate":
      // Re-choosing the open note's own day (Today, logging a reading for it) keeps the note open.
      if (view.stage === "note" && action.date === view.date) return view;
      return { stage: "day", date: action.date, noteId: null };
    case "openNote":
      return { stage: "note", date: action.date, noteId: action.noteId };
    case "closeNote":
      return { stage: "day", date: view.date, noteId: null };
    case "showCalendar":
      return { stage: "calendar", date: view.date, noteId: null };
  }
}
