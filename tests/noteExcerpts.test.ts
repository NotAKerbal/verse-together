import { describe, expect, test, vi } from "vitest";
import { JournalOutbox, RevisionConflictError } from "../src/features/notes/journalOutbox";
import { queueExcerpt, quotedExcerpt, scriptureExcerpt } from "../src/features/notes/noteExcerpts";
import { blockToMarkdown } from "../convex/noteJournal";

const jeremiah = { volume: "oldtestament", slug: "jeremiah", label: "Jeremiah" };

describe("a lesson selection's excerpt", () => {
  test("guide prose is quoted under a link to its place in the lesson", () => {
    const markdown = quotedExcerpt("  I have loved thee\nwith an everlasting love ", {
      label: "Jeremiah 31–33: [Hope] · Study guide · A new covenant",
      href: "/come-follow-me/2026-10-26#p-12",
    });
    expect(markdown).toBe(
      "**[Jeremiah 31–33: \\[Hope\\] · Study guide · A new covenant](</come-follow-me/2026-10-26#p-12>)**\n" +
        "> I have loved thee\n> with an everlasting love"
    );
    expect(quotedExcerpt(" \n ", { label: "Lesson", href: "/come-follow-me/2026-10-26" })).toBe("");
  });

  test("selected verses read as the scripture reader's Add to note writes them", () => {
    const markdown = scriptureExcerpt(jeremiah, [
      { chapter: 31, verse: 3, text: "I have loved thee with an everlasting love" },
      { chapter: 31, verse: 4, text: "Again I will build thee " },
    ]);
    expect(markdown).toBe(
      blockToMarkdown({
        type: "scripture",
        text: "I have loved thee with an everlasting love Again I will build thee",
        scriptureRef: { volume: "oldtestament", book: "jeremiah", chapter: 31, verseStart: 3, verseEnd: 4, reference: "Jeremiah 31:3–4" },
      })
    );
    expect(markdown).toBe(
      "**[Jeremiah 31:3–4](</browse/oldtestament/jeremiah/31#v-3>)**\n> I have loved thee with an everlasting love Again I will build thee"
    );
  });

  test("a selection across a chapter break credits each chapter's words to that chapter", () => {
    const markdown = scriptureExcerpt(jeremiah, [
      { chapter: 31, verse: 40, text: "it shall not be plucked up" },
      { chapter: 32, verse: 1, text: "The word that came to Jeremiah" },
      { chapter: 32, verse: 2, text: "   " },
    ]);
    expect(markdown).toBe(
      "**[Jeremiah 31:40](</browse/oldtestament/jeremiah/31#v-40>)**\n> it shall not be plucked up\n\n" +
        "**[Jeremiah 32:1](</browse/oldtestament/jeremiah/32#v-1>)**\n> The word that came to Jeremiah"
    );
    expect(scriptureExcerpt(jeremiah, [{ chapter: 31, verse: 1, text: " " }])).toBe("");
  });
});

describe("adding an excerpt to a note through the outbox", () => {
  const excerpt = "**[Jeremiah 31:3](</browse/oldtestament/jeremiah/31#v-3>)**\n> I have loved thee";

  test("goes after text typed and not yet saved, saving both on the revision it was typed on", async () => {
    const save = vi.fn().mockResolvedValue({ markdownRevision: 4 });
    const outbox = new JournalOutbox(save);
    outbox.edit("note", "My thoughts so far", 3);
    expect(queueExcerpt(outbox, "note", excerpt, null)).toBe(true);
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("note", `My thoughts so far\n\n${excerpt}`, 3);
    expect(outbox.get("note")).toMatchObject({ status: "saved", text: `My thoughts so far\n\n${excerpt}`, baseRevision: 4 });
    outbox.dispose();
  });

  test("joins a save in flight, which then saves the typed text and the excerpt together", async () => {
    let release!: (value: { markdownRevision: number }) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      .mockResolvedValue({ markdownRevision: 2 });
    const outbox = new JournalOutbox(save);
    outbox.edit("note", "Typed", 0);
    outbox.flush("note");
    expect(queueExcerpt(outbox, "note", excerpt, null)).toBe(true);
    vi.useFakeTimers();
    try {
      release({ markdownRevision: 1 });
      await vi.advanceTimersByTimeAsync(1000);
    } finally {
      vi.useRealTimers();
    }
    expect(save).toHaveBeenLastCalledWith("note", `Typed\n\n${excerpt}`, 1);
    expect(outbox.get("note")?.status).toBe("saved");
    outbox.dispose();
  });

  test("keeps a failed save's text and retries it with the excerpt", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ markdownRevision: 1 });
    const outbox = new JournalOutbox(save);
    outbox.edit("note", "Unsaved", 0);
    outbox.flush("note");
    await Promise.resolve();
    expect(outbox.get("note")?.status).toBe("error");
    expect(queueExcerpt(outbox, "note", excerpt, null)).toBe(true);
    await Promise.resolve();
    expect(save).toHaveBeenLastCalledWith("note", `Unsaved\n\n${excerpt}`, 0);
    outbox.dispose();
  });

  test("with nothing unsaved, goes after the stored note (a device note), or is left to the caller (the account)", async () => {
    const save = vi.fn().mockResolvedValue({ markdownRevision: 8 });
    const outbox = new JournalOutbox(save);
    expect(queueExcerpt(outbox, "account-note", excerpt, null)).toBe(false);
    expect(outbox.get("account-note")).toBeUndefined();

    expect(queueExcerpt(outbox, "device-note", excerpt, { body: "Stored body\n", revision: 7 })).toBe(true);
    await Promise.resolve();
    expect(save).toHaveBeenCalledWith("device-note", `Stored body\n\n${excerpt}`, 7);

    // A saved copy older than the stored note (another tab saved since) gives way to the stored note.
    expect(queueExcerpt(outbox, "device-note", "More", { body: "Saved elsewhere", revision: 9 })).toBe(true);
    await Promise.resolve();
    expect(save).toHaveBeenLastCalledWith("device-note", "Saved elsewhere\n\nMore", 9);
    outbox.dispose();
  });

  test("refuses a note whose save conflicted, leaving its text for the person to settle", async () => {
    const save = vi.fn().mockRejectedValue(new RevisionConflictError(5));
    const outbox = new JournalOutbox(save);
    outbox.edit("note", "Mine", 2);
    outbox.flush("note");
    await Promise.resolve();
    expect(() => queueExcerpt(outbox, "note", excerpt, { body: "Theirs", revision: 5 })).toThrow(/changed somewhere else/);
    expect(outbox.get("note")).toMatchObject({ status: "conflict", text: "Mine" });
    expect(save).toHaveBeenCalledTimes(1);
    outbox.dispose();
  });
});
