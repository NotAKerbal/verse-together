// The limits and clean-up for feedback, shared by convex/feedback.ts, the /api/feedback route and the Settings
// feedback form. Pure (no Convex imports) so it can be unit tested and imported by the UI.

export const FEEDBACK_MESSAGE_MIN = 5;
export const FEEDBACK_MESSAGE_MAX = 2000;
export const FEEDBACK_CONTACT_MAX = 200;
export const FEEDBACK_PATH_MAX = 200;

export type FeedbackInput = { message: string; contact?: string | null; path?: string | null };
export type CleanFeedback = { message: string; contact?: string; path?: string };

/** Why a message can't be sent, worded for the form; null when it can. Checks the trimmed text. */
export function feedbackMessageError(message: string): string | null {
  const length = message.trim().length;
  if (length < FEEDBACK_MESSAGE_MIN) return `Write at least ${FEEDBACK_MESSAGE_MIN} characters.`;
  if (length > FEEDBACK_MESSAGE_MAX) return `Keep it to ${FEEDBACK_MESSAGE_MAX} characters or fewer.`;
  return null;
}

export function feedbackContactError(contact: string): string | null {
  return contact.trim().length > FEEDBACK_CONTACT_MAX ? `Keep it to ${FEEDBACK_CONTACT_MAX} characters or fewer.` : null;
}

/**
 * Only the page's path is kept: a query string or hash can hold tokens (sign-in callbacks, reset links), so both
 * are dropped. Anything that isn't a site path is dropped too, and long paths are cut short.
 */
export function cleanFeedbackPath(path: string | null | undefined): string | undefined {
  const pathname = (path ?? "").split(/[?#]/, 1)[0].trim();
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return undefined;
  return pathname.slice(0, FEEDBACK_PATH_MAX);
}

/** The feedback as it is stored, trimmed and bounded. Throws when the message or contact is out of bounds. */
export function cleanFeedback(input: FeedbackInput): CleanFeedback {
  const message = input.message.trim();
  if (message.length < FEEDBACK_MESSAGE_MIN) throw new Error("Feedback message is too short");
  if (message.length > FEEDBACK_MESSAGE_MAX) throw new Error("Feedback message is too long");
  const contact = (input.contact ?? "").trim();
  if (contact.length > FEEDBACK_CONTACT_MAX) throw new Error("Feedback contact is too long");
  return {
    message,
    contact: contact || undefined,
    path: cleanFeedbackPath(input.path),
  };
}
