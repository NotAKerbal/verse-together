// Sending Settings → Feedback, as the website does (src/components/FeedbackForm.tsx and src/lib/appData.ts): the
// existing feedback:submitFeedback function (convex/feedback.ts) checks and cleans the message with the shared rules
// (convex/feedbackRules.ts). Signed in and connected, it goes through the account's own session, so the backend links
// it to the verified account; otherwise anonymously, to this build's own deployment (EXPO_PUBLIC_CONVEX_URL, see
// account/config.ts). A build without that configuration has nowhere to send it, and says so; nothing defaults to
// production.

import { makeFunctionReference } from "convex/server";
import { cleanFeedback, type FeedbackInput } from "../../../../convex/feedbackRules";
import { readAccountConfig } from "../../account/config";
import { getStudySession } from "../../storage/studySession";
import { activePreferencesSync } from "./preferencesSync";

export const submitFeedbackRef = makeFunctionReference<"mutation", { message: string; contact?: string; path?: string }, { ok: boolean }>(
  "feedback:submitFeedback",
);

/** Only a path goes with the message (feedbackRules.ts drops anything else): where in the app it was sent from. */
export const FEEDBACK_PATH = "/native/settings/feedback";

const SEND_TIMEOUT_MS = 20_000;

export type FeedbackRoute =
  /** Sent through the signed-in account's session: linked to the account. */
  | { kind: "account"; send: (args: ReturnType<typeof cleanFeedback>) => Promise<unknown> }
  /** Sent without an account. `signedIn`: an account is signed in but not connected, so it can't be linked. */
  | { kind: "anonymous"; signedIn: boolean; send: (args: ReturnType<typeof cleanFeedback>) => Promise<unknown> }
  | { kind: "unavailable" };

function anonymousSender(convexUrl: string) {
  return async (args: ReturnType<typeof cleanFeedback>) => {
    // Required lazily, like the account's own modules, so a build or test that never sends doesn't load it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep the optional network client lazy in the native bundle.
    const { ConvexHttpClient } = require("convex/browser") as typeof import("convex/browser");
    return new ConvexHttpClient(convexUrl).mutation(submitFeedbackRef, args);
  };
}

/** How feedback sent now would go. */
export function feedbackRoute(config = readAccountConfig()): FeedbackRoute {
  const session = getStudySession();
  if (session.mode === "account") {
    const sync = activePreferencesSync(session.owner);
    if (sync && session.sync?.connected()) return { kind: "account", send: (args) => sync.mutation(submitFeedbackRef, args) };
  }
  if (!config) return { kind: "unavailable" };
  return { kind: "anonymous", signedIn: session.mode !== "device", send: anonymousSender(config.convexUrl) };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Sends one message by `route`. Throws (keeping nothing) when it can't be sent or the backend refuses it. */
export async function sendFeedback(input: Omit<FeedbackInput, "path">, route: FeedbackRoute): Promise<void> {
  if (route.kind === "unavailable") throw new Error("Feedback isn't available in this build.");
  const args = cleanFeedback({ ...input, path: FEEDBACK_PATH });
  await withTimeout(route.send(args), SEND_TIMEOUT_MS);
}
