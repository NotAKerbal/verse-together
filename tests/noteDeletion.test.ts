import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { newBackend, signInAs } from "./convexAuthHarness";

// "alice" and "bob" are stable app owner keys, each linked to a live Better Auth session (convexAuthHarness).
async function setup() {
  const t = newBackend();
  const alice = await signInAs(t, "alice");
  const bob = await signInAs(t, "bob");
  return { t, alice: alice.as, bob: bob.as };
}

const rowsFor = (t: ReturnType<typeof newBackend>, draftId: Id<"insightDrafts">) =>
  t.run(async (ctx) => ({
    draft: await ctx.db.get(draftId),
    blocks: await ctx.db.query("insightDraftBlocks").withIndex("by_draft", (q) => q.eq("draftId", draftId)).collect(),
    assignments: (await ctx.db.query("noteFolderAssignments").collect()).filter((row) => row.draftId === draftId),
  }));

describe("deleting a note", () => {
  test("only its signed-in owner can delete it; refused attempts leave everything in place", async () => {
    const { t, alice, bob } = await setup();
    const { id } = await alice.mutation(api.insights.createJournalNote, { journalDate: "2026-10-21" });
    await alice.mutation(api.insights.saveJournalNote, { draftId: id, markdownBody: "Private", expectedRevision: 0 });

    await expect(t.mutation(api.insights.deleteDraft, { draftId: id })).rejects.toThrow();
    await expect(bob.mutation(api.insights.deleteDraft, { draftId: id })).rejects.toThrow("Draft not found");

    expect((await alice.query(api.insights.getDraft, { draftId: id }))!.markdown_body).toBe("Private");
    expect(await alice.query(api.insights.listMyDrafts, {})).toHaveLength(1);
  });

  test("removes the note, its legacy blocks and its folder filing, and it leaves the owner's lists", async () => {
    const { t, alice, bob } = await setup();
    const { id } = await alice.mutation(api.insights.createDraft, { title: "Old note" });
    await alice.mutation(api.insights.addBlock, { draftId: id, type: "text", text: "Legacy block" });
    const { id: folderId } = await alice.mutation(api.noteFolders.createFolder, { name: "Study" });
    await alice.mutation(api.noteFolders.assignDraftFolder, { draftId: id, folderId });
    const { id: kept } = await alice.mutation(api.insights.createJournalNote, { journalDate: "2026-10-21" });
    const { id: bobs } = await bob.mutation(api.insights.createJournalNote, { journalDate: "2026-10-21" });
    const before = await rowsFor(t, id);
    expect(before.blocks).toHaveLength(1);
    expect(before.assignments).toHaveLength(1);

    await alice.mutation(api.insights.deleteDraft, { draftId: id });

    expect(await rowsFor(t, id)).toEqual({ draft: null, blocks: [], assignments: [] });
    await expect(alice.query(api.insights.getDraft, { draftId: id })).rejects.toThrow("Draft not found");
    expect((await alice.query(api.insights.listMyDrafts, {})).map((row) => row.id)).toEqual([kept]);
    const journal = await alice.query(api.insights.listMyJournal, {});
    expect(journal.some((entry) => entry.id === id)).toBe(false);
    expect(journal.some((entry) => entry.id === kept)).toBe(true);
    // The folder itself and other notes, including another person's, are untouched.
    expect((await alice.query(api.noteFolders.getWorkspace, {})).folders).toHaveLength(1);
    expect((await bob.query(api.insights.getDraft, { draftId: bobs }))!.id).toBe(bobs);
    // Deleting again, or saving to it afterwards, fails instead of recreating anything.
    await expect(alice.mutation(api.insights.deleteDraft, { draftId: id })).rejects.toThrow("Draft not found");
    await expect(
      alice.mutation(api.insights.saveJournalNote, { draftId: id, markdownBody: "late", expectedRevision: 0 })
    ).rejects.toThrow();
    expect((await rowsFor(t, id)).draft).toBeNull();
  });

  test("published notes are refused and kept; archived notes can be deleted", async () => {
    const { t, alice } = await setup();
    const { id: published } = await alice.mutation(api.insights.createJournalNote, { journalDate: "2026-10-21" });
    await alice.mutation(api.insights.saveJournalNote, { draftId: published, markdownBody: "# Shared", expectedRevision: 0 });
    await alice.mutation(api.insights.publishDraft, { draftId: published });
    await expect(alice.mutation(api.insights.deleteDraft, { draftId: published })).rejects.toThrow(
      "Published insights cannot be deleted"
    );
    expect((await rowsFor(t, published)).draft?.status).toBe("published");

    const { id: archived } = await alice.mutation(api.insights.createJournalNote, { journalDate: "2026-10-21" });
    await t.run((ctx) => ctx.db.patch(archived, { status: "archived" }));
    await alice.mutation(api.insights.deleteDraft, { draftId: archived });
    expect((await rowsFor(t, archived)).draft).toBeNull();
  });
});
