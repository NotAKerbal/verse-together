import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import {
  cleanFeedback,
  cleanFeedbackPath,
  FEEDBACK_CONTACT_MAX,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_PATH_MAX,
} from "../convex/feedbackRules";
import {
  feedbackFormReducer,
  INITIAL_FEEDBACK_FORM,
  visibleFeedbackErrors,
  type FeedbackFormAction,
  type FeedbackFormState,
} from "../src/features/feedback/feedbackForm";
import { newBackend, signInAs, type Backend } from "./convexAuthHarness";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: auth.user, loading: auth.loading, getToken: async () => null }),
}));
vi.mock("@/lib/appData", () => ({ submitFeedback: vi.fn() }));
// The other Settings panels are out of scope: only the tabs and the Feedback panel are checked.
vi.mock("@/features/auth/AccountManager", () => ({ default: () => null }));
vi.mock("@/features/annotations/QuickMarkSettings", () => ({ default: () => null }));
vi.mock("@/features/settings/ReadingSettings", () => ({ default: () => null }));
vi.mock("@/features/settings/ReleaseNotes", () => ({ default: () => null }));

const { default: FeedbackForm } = await import("../src/components/FeedbackForm");
const { default: AccountPage } = await import("../src/app/account/page");

const storedFeedback = (t: Backend) => t.run((ctx) => ctx.db.query("feedback").collect());

describe("feedback backend", () => {
  test("anonymous feedback is stored trimmed, without an owner, and with only the page's path", async () => {
    const t = newBackend();
    await t.mutation(api.feedback.submitFeedback, {
      message: "  The reader could remember my place.  ",
      contact: "  reader@example.com ",
      path: "/reset-password?token=secret#access_token=also-secret",
    });
    const rows = await storedFeedback(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      message: "The reader could remember my place.",
      contact: "reader@example.com",
      path: "/reset-password",
    });
    expect(rows[0].clerkId).toBeUndefined();
    expect(JSON.stringify(rows[0])).not.toContain("secret");
  });

  test("blank contact and path are left out rather than stored empty", async () => {
    const t = newBackend();
    await t.mutation(api.feedback.submitFeedback, { message: "Works well", contact: "   ", path: "" });
    const [row] = await storedFeedback(t);
    expect(row.contact).toBeUndefined();
    expect(row.path).toBeUndefined();
  });

  test("a verified, linked account is credited; an unlinked or signed-out one is not", async () => {
    const t = newBackend();
    const alice = await signInAs(t, "alice");
    await alice.as.mutation(api.feedback.submitFeedback, { message: "From Alice", path: "/account" });

    const unlinked = await signInAs(t, "bob", "Bob", { linked: false });
    await unlinked.as.mutation(api.feedback.submitFeedback, { message: "From an unlinked account" });

    const carol = await signInAs(t, "carol");
    await carol.revoke();
    await carol.as.mutation(api.feedback.submitFeedback, { message: "After signing out" });

    const byMessage = Object.fromEntries((await storedFeedback(t)).map((row) => [row.message, row.clerkId]));
    expect(byMessage).toEqual({
      "From Alice": "alice",
      "From an unlinked account": undefined,
      "After signing out": undefined,
    });
  });

  test("out-of-bounds messages and contacts are rejected and nothing is stored", async () => {
    const t = newBackend();
    const submit = (args: { message: string; contact?: string }) => t.mutation(api.feedback.submitFeedback, args);
    await expect(submit({ message: "  hi   " })).rejects.toThrow("Feedback message is too short");
    await expect(submit({ message: "x".repeat(FEEDBACK_MESSAGE_MAX + 1) })).rejects.toThrow("Feedback message is too long");
    await expect(submit({ message: "Fine message", contact: "c".repeat(FEEDBACK_CONTACT_MAX + 1) })).rejects.toThrow(
      "Feedback contact is too long"
    );
    expect(await storedFeedback(t)).toEqual([]);

    // The limits apply to the trimmed text.
    await submit({ message: `  ${"x".repeat(FEEDBACK_MESSAGE_MAX)}  `, contact: ` ${"c".repeat(FEEDBACK_CONTACT_MAX)} ` });
    expect(await storedFeedback(t)).toHaveLength(1);
  });
});

describe("feedback rules", () => {
  test("only a site path is kept, cut to length", () => {
    expect(cleanFeedbackPath("/browse/bookofmormon?x=1")).toBe("/browse/bookofmormon");
    expect(cleanFeedbackPath("/account#feedback")).toBe("/account");
    expect(cleanFeedbackPath("https://evil.example/path")).toBeUndefined();
    expect(cleanFeedbackPath("//evil.example/path")).toBeUndefined();
    expect(cleanFeedbackPath("?token=abc")).toBeUndefined();
    expect(cleanFeedbackPath(null)).toBeUndefined();
    expect(cleanFeedbackPath(`/${"a".repeat(500)}`)).toHaveLength(FEEDBACK_PATH_MAX);
  });

  test("cleanFeedback is what the backend stores", () => {
    expect(cleanFeedback({ message: " Hello there ", contact: null, path: "/notes?draft=1" })).toEqual({
      message: "Hello there",
      contact: undefined,
      path: "/notes",
    });
  });
});

describe("feedback form state", () => {
  const run = (...actions: FeedbackFormAction[]) =>
    actions.reduce<FeedbackFormState>(feedbackFormReducer, INITIAL_FEEDBACK_FORM);
  const typed = (message: string, contact = ""): FeedbackFormAction[] => [
    { type: "edit", field: "message", value: message },
    { type: "edit", field: "contact", value: contact },
  ];

  test("errors appear only after a send attempt, then follow the trimmed text", () => {
    expect(visibleFeedbackErrors(run(...typed("hey")))).toEqual({ message: null, contact: null });

    const tooShort = run(...typed("   hey   "), { type: "submit" });
    expect(tooShort.status).toBe("idle");
    expect(visibleFeedbackErrors(tooShort).message).toBe("Write at least 5 characters.");

    const fixed = feedbackFormReducer(tooShort, { type: "edit", field: "message", value: "hey there" });
    expect(visibleFeedbackErrors(fixed).message).toBeNull();

    const longContact = run(...typed("Good message", "c".repeat(FEEDBACK_CONTACT_MAX + 1)), { type: "submit" });
    expect(longContact.status).toBe("idle");
    expect(visibleFeedbackErrors(longContact).contact).toMatch(/200 characters/);
  });

  test("while sending, the draft can't change and a second send is refused", () => {
    const pending = run(...typed("Please add dark mode", "me@example.com"), { type: "submit" });
    expect(pending.status).toBe("pending");
    expect(feedbackFormReducer(pending, { type: "edit", field: "message", value: "changed" })).toBe(pending);
    expect(feedbackFormReducer(pending, { type: "submit" })).toBe(pending);
  });

  test("a failed send keeps the draft for another try", () => {
    const failed = run(...typed("Please add dark mode", "me@example.com"), { type: "submit" }, { type: "failed" });
    expect(failed.status).toBe("failed");
    expect(failed.draft).toEqual({ message: "Please add dark mode", contact: "me@example.com" });
    expect(feedbackFormReducer(failed, { type: "submit" }).status).toBe("pending");
  });

  test("a successful send clears the draft and confirms until the next edit", () => {
    const sent = run(...typed("Please add dark mode", "me@example.com"), { type: "submit" }, { type: "succeeded" });
    expect(sent).toEqual({ ...INITIAL_FEEDBACK_FORM, status: "sent" });
    // A late or repeated result changes nothing.
    expect(feedbackFormReducer(sent, { type: "failed" })).toBe(sent);
    expect(feedbackFormReducer(sent, { type: "edit", field: "message", value: "A" }).status).toBe("idle");
    // Sending an empty form again doesn't leave the old confirmation beside the new error.
    expect(feedbackFormReducer(sent, { type: "submit" }).status).toBe("idle");
  });
});

describe("feedback form", () => {
  const render = () => renderToStaticMarkup(createElement(FeedbackForm));
  const attr = (html: string, pattern: RegExp) => html.match(pattern)?.[1];

  test("labels, hints and the status region are linked to their fields", () => {
    auth.user = null;
    const html = render();
    const messageId = attr(html, /<textarea[^>]*id="([^"]+)"/);
    const contactId = attr(html, /<input[^>]*id="([^"]+)"/);
    expect(html).toContain(`for="${messageId}"`);
    expect(html).toContain(`for="${contactId}"`);
    const messageHint = attr(html, /<textarea[^>]*aria-describedby="([^"]+)"/);
    const contactHint = attr(html, /<input[^>]*aria-describedby="([^"]+)"/);
    expect(html).toContain(`id="${messageHint}"`);
    expect(html).toContain(`id="${contactHint}"`);
    expect(html).toMatch(/<textarea[^>]*maxLength="2000"/);
    expect(html).toMatch(/<input[^>]*maxLength="200"/);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('aria-invalid="true"');
  });

  test("says whether the feedback will be anonymous or linked to the account", () => {
    auth.user = null;
    expect(render()).toContain("Sent anonymously. You don&#x27;t need to sign in.");
    auth.user = { id: "u" };
    expect(render()).toContain("Linked to your account when you send it.");
    auth.user = null;
  });
});

describe("Settings → Feedback", () => {
  test("the Feedback tab controls its panel, which holds the form", () => {
    const html = renderToStaticMarkup(createElement(AccountPage));
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*id="settings-tab-feedback"[^>]*aria-controls="settings-panel-feedback"/);
    expect(html).toMatch(/<section[^>]*id="settings-panel-feedback"[^>]*aria-labelledby="settings-tab-feedback"/);
    const panel = html.slice(html.indexOf('id="settings-panel-feedback"'));
    expect(panel).toContain("Send feedback");
    // Account opens first (no hash on the server), so Feedback starts hidden.
    expect(html).toMatch(/<section[^>]*id="settings-panel-feedback"[^>]*hidden/);
  });
});
