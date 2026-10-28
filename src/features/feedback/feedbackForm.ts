import { feedbackContactError, feedbackMessageError } from "../../../convex/feedbackRules";

/*
  The Settings feedback form's state, kept pure so its rules can be tested without a browser:
  - nothing is sent until the message passes the same checks the backend makes;
  - while a send is in flight the draft can't change and a second send is refused;
  - a failed send keeps the draft so nothing typed is lost;
  - a successful send clears the draft and says so until the next edit, so the confirmation stays long enough
    to be read (and announced) but never sits beside a new, unsent draft.
*/

export type FeedbackDraft = { message: string; contact: string };

export type FeedbackFormState = {
  draft: FeedbackDraft;
  status: "idle" | "pending" | "sent" | "failed";
  /** Set by a send attempt, so field errors appear only after the first try and then update as you type. */
  attempted: boolean;
};

export type FeedbackFormAction =
  | { type: "edit"; field: keyof FeedbackDraft; value: string }
  | { type: "submit" }
  | { type: "succeeded" }
  | { type: "failed" };

export const INITIAL_FEEDBACK_FORM: FeedbackFormState = {
  draft: { message: "", contact: "" },
  status: "idle",
  attempted: false,
};

export type FeedbackFieldErrors = { message: string | null; contact: string | null };

export function feedbackFieldErrors(draft: FeedbackDraft): FeedbackFieldErrors {
  return { message: feedbackMessageError(draft.message), contact: feedbackContactError(draft.contact) };
}

/** The errors to show: none before the first send attempt. */
export function visibleFeedbackErrors(state: FeedbackFormState): FeedbackFieldErrors {
  return state.attempted ? feedbackFieldErrors(state.draft) : { message: null, contact: null };
}

export function canSendFeedback(draft: FeedbackDraft): boolean {
  const errors = feedbackFieldErrors(draft);
  return !errors.message && !errors.contact;
}

export function feedbackFormReducer(state: FeedbackFormState, action: FeedbackFormAction): FeedbackFormState {
  switch (action.type) {
    case "edit":
      // The draft being sent is the one shown, so it can't change under the request.
      if (state.status === "pending") return state;
      return {
        ...state,
        draft: { ...state.draft, [action.field]: action.value },
        status: state.status === "sent" ? "idle" : state.status,
      };
    case "submit":
      if (state.status === "pending") return state;
      if (!canSendFeedback(state.draft)) return { ...state, attempted: true, status: state.status === "sent" ? "idle" : state.status };
      return { ...state, attempted: true, status: "pending" };
    case "succeeded":
      if (state.status !== "pending") return state;
      return { ...INITIAL_FEEDBACK_FORM, status: "sent" };
    case "failed":
      if (state.status !== "pending") return state;
      return { ...state, status: "failed" };
  }
}
