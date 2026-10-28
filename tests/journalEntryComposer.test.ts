import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { freshEntryDraft, type EntryDraft, type EntrySaveState } from "../src/features/notes/entryDraft";

// The composer reads its draft and save from the provider; only what it renders for each save state is checked.
const provider = {
  entrySave: { status: "idle" } as EntrySaveState,
  entryDraft: { ...freshEntryDraft({ journalDate: "2026-10-25" }), text: "Kept text" },
};
vi.mock("@/features/insights/InsightBuilderProvider", () => ({
  useInsightBuilder: () => ({
    entryDraft: provider.entryDraft,
    updateEntryDraft: () => {},
    saveEntryDraft: async () => ({ id: null }),
    openSavedEntry: () => null,
    entrySave: provider.entrySave,
  }),
}));
vi.mock("../src/features/notes/useConvexSignedIn", () => ({ useConvexSignedIn: () => ({ ready: true }) }));
vi.mock("../src/features/notes/LazyMarkdownEditor", () => ({
  default: ({ value }: { value: string }) => createElement("div", { "data-markdown-editor": true }, value),
}));

const { default: JournalEntryComposer } = await import("../src/features/notes/JournalEntryComposer");

function render(entrySave: EntrySaveState, draft?: EntryDraft, readingFirst = false) {
  provider.entrySave = entrySave;
  provider.entryDraft = draft ?? { ...freshEntryDraft({ journalDate: "2026-10-25" }), text: "Kept text" };
  return renderToStaticMarkup(createElement(JournalEntryComposer, { options: [], onSaved: () => {}, readingFirst }));
}

describe("the entry composer's save states", () => {
  test("a save in flight (also after reopening the sheet) keeps the entry read-only", () => {
    const html = render({ status: "saving" });
    expect(html).toMatch(/<fieldset disabled=""/);
    expect(html).toContain("Saving…");
  });

  test("a failed save offers Try again; a conflict explains itself and offers both ways forward", () => {
    expect(render({ status: "failed" })).toContain("Try again");
    const conflict = render({ status: "conflict", id: "entry-1", journalDate: "2026-10-24" });
    expect(conflict).toContain("changed in another window");
    expect(conflict).toContain("Open saved entry");
    expect(conflict).toContain("Save as new entry");
    expect(conflict).not.toContain("ENTRY_CONFLICT");
    const kept = render({ status: "kept", id: "entry-1", journalDate: "2026-10-25" });
    expect(kept).toContain("Your entry was saved.");
    expect(kept).toContain("Open saved entry");
  });

  test("an idle entry shows Save entry with no notice", () => {
    const html = render({ status: "idle" });
    expect(html).toContain("Save entry");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/<fieldset disabled=""/);
  });
});


describe("reading-first entries", () => {
  const reading = () => freshEntryDraft({
    source: { kind: "scripture", label: "Jeremiah 31", href: "/browse/oldtestament/jeremiah/31" },
    logReading: true,
  });

  test("a fresh reading can be logged without loading or focusing a note editor", () => {
    const html = render({ status: "idle" }, reading(), true);
    expect(html).toContain('aria-label="Add a note"');
    expect(html).toContain(">Log reading</button>");
    expect(html).not.toContain("data-markdown-editor");
    expect(html).not.toContain("Save note");
  });

  test("reopening written Markdown resumes the note and offers Save note", () => {
    const html = render({ status: "idle" }, { ...reading(), text: "# Hope\n\n**Keep this**" }, true);
    expect(html).toContain("data-markdown-editor");
    expect(html).toContain("**Keep this**");
    expect(html).toContain("Save note");
    expect(html).not.toContain('aria-label="Add a note"');
  });

  test("a note-only entry opens the Markdown editor immediately", () => {
    const html = render({ status: "idle" }, freshEntryDraft(), true);
    expect(html).toContain("data-markdown-editor");
    expect(html).toContain("Save note");
  });
});
