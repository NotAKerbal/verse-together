import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { DEFAULT_JOURNAL_GOALS } from "../src/lib/journalGoals";
import { newBackend, newSession, signInAs } from "./convexAuthHarness";

describe("private weekly journal goals", () => {
  test("defaults for existing accounts; saves only this user's targets without touching recorded activity", async () => {
    const t = newBackend();
    const alice = await signInAs(t, "alice");
    const bob = await signInAs(t, "bob");
    expect(await alice.as.query(api.users.getJournalGoals, {})).toEqual(DEFAULT_JOURNAL_GOALS);
    await alice.as.mutation(api.insights.createJournalEntry, {
      journalDate: "2026-10-25", markdownBody: "Keep this reflection.", logReading: false, requestId: "before-goals",
    });
    const before = await alice.as.query(api.insights.listMyJournal, {});
    await alice.as.mutation(api.users.saveJournalGoals, { studyDays: 7, reflections: 2 });
    expect(await alice.as.query(api.users.getJournalGoals, {})).toEqual({ studyDays: 7, reflections: 2 });
    expect(await bob.as.query(api.users.getJournalGoals, {})).toEqual(DEFAULT_JOURNAL_GOALS);
    expect(await alice.as.query(api.insights.listMyJournal, {})).toEqual(before);
    // A new live session for the same account reads the persisted database values.
    const sessionId = await newSession(t, alice.authUserId);
    const reconnected = t.withIdentity({ subject: alice.authUserId, sessionId });
    expect(await reconnected.query(api.users.getJournalGoals, {})).toEqual({ studyDays: 7, reflections: 2 });
  });

  test("rejects anonymous, unlinked and revoked sessions", async () => {
    const t = newBackend();
    expect(await t.query(api.users.getJournalGoals, {})).toBeNull();
    await expect(t.mutation(api.users.saveJournalGoals, DEFAULT_JOURNAL_GOALS)).rejects.toThrow("Unauthorized");
    const unlinked = await signInAs(t, "unlinked", "Unlinked", { linked: false });
    await expect(unlinked.as.mutation(api.users.saveJournalGoals, DEFAULT_JOURNAL_GOALS)).rejects.toThrow("Unauthorized");
    const alice = await signInAs(t, "alice");
    await alice.revoke();
    expect(await alice.as.query(api.users.getJournalGoals, {})).toBeNull();
    await expect(alice.as.mutation(api.users.saveJournalGoals, DEFAULT_JOURNAL_GOALS)).rejects.toThrow("Unauthorized");
  });

  test.each([
    { studyDays: 0, reflections: 3 }, { studyDays: 8, reflections: 3 }, { studyDays: 2.5, reflections: 3 },
    { studyDays: 5, reflections: 0 }, { studyDays: 5, reflections: 22 }, { studyDays: 5, reflections: 1.5 },
  ])("rejects invalid targets $studyDays / $reflections without replacing saved goals", async goals => {
    const t = newBackend();
    const { as } = await signInAs(t, "alice");
    await expect(as.mutation(api.users.saveJournalGoals, goals)).rejects.toThrow();
    expect(await as.query(api.users.getJournalGoals, {})).toEqual(DEFAULT_JOURNAL_GOALS);
  });
});
