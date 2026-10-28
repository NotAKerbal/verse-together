"use client";

import { useId, useReducer, useRef, type FormEvent } from "react";
import styles from "@/app/account/page.module.css";
import { FormMessage, INPUT_CLASS, SECONDARY_BUTTON_CLASS } from "@/features/auth/AuthUi";
import {
  canSendFeedback,
  feedbackFieldErrors,
  feedbackFormReducer,
  INITIAL_FEEDBACK_FORM,
  visibleFeedbackErrors,
} from "@/features/feedback/feedbackForm";
import { submitFeedback } from "@/lib/appData";
import { useAuth } from "@/lib/auth";
import { FEEDBACK_CONTACT_MAX, FEEDBACK_MESSAGE_MAX, FEEDBACK_MESSAGE_MIN } from "../../convex/feedbackRules";

const describedBy = (...ids: (string | false | null | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;

/**
 * Settings → Feedback: a message and an optional way to reply. Anyone can send it; when signed in, the backend
 * links it to the verified account. Only the page's path goes with it, never its query string or hash.
 */
export default function FeedbackForm() {
  const { user, loading, getToken } = useAuth();
  const [state, dispatch] = useReducer(feedbackFormReducer, INITIAL_FEEDBACK_FORM);
  // A second submit before React re-renders (a double click, Enter held down) still finds the first in flight.
  const sendingRef = useRef(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const ids = {
    message: `${id}-message`,
    messageHint: `${id}-message-hint`,
    messageError: `${id}-message-error`,
    contact: `${id}-contact`,
    contactHint: `${id}-contact-hint`,
    contactError: `${id}-contact-error`,
  };

  const pending = state.status === "pending";
  const errors = visibleFeedbackErrors(state);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingRef.current || pending) return;
    dispatch({ type: "submit" });
    if (!canSendFeedback(state.draft)) {
      // The field's error is linked to it, so moving focus there reads it out.
      (feedbackFieldErrors(state.draft).message ? messageRef : contactRef).current?.focus();
      return;
    }

    sendingRef.current = true;
    try {
      const token = await getToken({ template: "convex" });
      await submitFeedback(
        {
          message: state.draft.message.trim(),
          contact: state.draft.contact.trim() || null,
          path: window.location.pathname,
        },
        token
      );
      dispatch({ type: "succeeded" });
    } catch {
      dispatch({ type: "failed" });
    } finally {
      sendingRef.current = false;
    }
  }

  return (
    <section className={`${styles.settingsCard} ${styles.feedbackCard}`} aria-labelledby={`${id}-title`}>
      <div className={styles.preferences}>
        <div className={styles.cardHeader}>
          <div>
            <h3 id={`${id}-title`} className={styles.settingTitle}>
              Send feedback
            </h3>
            <p>
              {loading
                ? "Ideas, problems, or anything that would help."
                : user
                  ? "Linked to your account when you send it."
                  : "Sent anonymously. You don't need to sign in."}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.feedbackForm} aria-busy={pending || undefined} noValidate>
          <div>
            <label htmlFor={ids.message} className="block text-sm font-semibold">
              Your feedback
            </label>
            <textarea
              ref={messageRef}
              id={ids.message}
              name="message"
              rows={6}
              required
              maxLength={FEEDBACK_MESSAGE_MAX}
              readOnly={pending}
              value={state.draft.message}
              onChange={(event) => dispatch({ type: "edit", field: "message", value: event.target.value })}
              placeholder="What would make Verse Together better?"
              className={`${INPUT_CLASS} ${styles.feedbackMessage}`}
              aria-invalid={errors.message ? true : undefined}
              aria-describedby={describedBy(ids.messageHint, errors.message && ids.messageError)}
            />
            <div className={styles.fieldMeta}>
              <p id={ids.messageHint}>
                {FEEDBACK_MESSAGE_MIN} to {FEEDBACK_MESSAGE_MAX} characters. Please leave out passwords and private
                details.
              </p>
              <span aria-hidden="true">
                {state.draft.message.length}/{FEEDBACK_MESSAGE_MAX}
              </span>
            </div>
            {errors.message ? (
              <p id={ids.messageError} className={styles.fieldError}>
                {errors.message}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={ids.contact} className="block text-sm font-semibold">
              How to reach you <span className="font-normal text-[color:var(--foreground-muted)]">(optional)</span>
            </label>
            <input
              ref={contactRef}
              id={ids.contact}
              name="contact"
              type="text"
              autoComplete="email"
              maxLength={FEEDBACK_CONTACT_MAX}
              readOnly={pending}
              value={state.draft.contact}
              onChange={(event) => dispatch({ type: "edit", field: "contact", value: event.target.value })}
              className={INPUT_CLASS}
              aria-invalid={errors.contact ? true : undefined}
              aria-describedby={describedBy(ids.contactHint, errors.contact && ids.contactError)}
            />
            <p id={ids.contactHint} className={styles.fieldMeta}>
              An email or handle, if you&apos;d like a reply. Only the developer sees it.
            </p>
            {errors.contact ? (
              <p id={ids.contactError} className={styles.fieldError}>
                {errors.contact}
              </p>
            ) : null}
          </div>

          {state.status === "failed" ? (
            <FormMessage tone="error">
              Your feedback couldn&apos;t be sent. It&apos;s still here, so you can try again.
            </FormMessage>
          ) : null}
          {/* Always in the page, so screen readers announce the confirmation when it appears. */}
          <p role="status" className={state.status === "sent" ? styles.feedbackSent : "sr-only"}>
            {state.status === "sent" ? "Thanks! Your feedback was sent." : pending ? "Sending feedback…" : ""}
          </p>

          <button
            type="submit"
            className={`${SECONDARY_BUTTON_CLASS} aria-disabled:cursor-wait aria-disabled:opacity-60`}
            // aria-disabled, not disabled, so the button keeps keyboard focus while it sends.
            aria-disabled={pending || undefined}
          >
            {pending ? "Sending…" : "Send feedback"}
          </button>
        </form>
      </div>
    </section>
  );
}
