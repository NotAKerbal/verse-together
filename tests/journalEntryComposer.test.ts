import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { freshEntryDraft, type EntrySaveState } from "../src/features/notes/entryDraft";

// The composer reads its draft and save from the provider; only what it renders for each save state is checked.
const provider = { entrySave: { status: "idle" } as EntrySaveState };
vi.mock("@/features/insights/InsightBuilderProvider", () => ({
  useInsightBuilder: () => ({
    entryDraft: { ...freshEntryDraft({ journalDate: "2026-10-25" }), text: "Kept text" },
    updateEntryDraft: () => {},
    saveEntryDraft: async () => ({ id: null }),
    openSavedEntry: () => null,
    entrySave: provider.entrySave,
  }),
}));
vi.mock("../src/features/notes/useConvexSignedIn", () => ({ useConvexSignedIn: () => ({ ready: true }) }));
vi.mock("../src/features/notes/LazyMarkdownEditor", () => ({ default: () => null }));

const { default: JournalEntryComposer } = await import("../src/features/notes/JournalEntryComposer");

function render(entrySave: EntrySaveState) {
  provider.entrySave = entrySave;
  return renderToStaticMarkup(createElement(JournalEntryComposer, { options: [], onSaved: () => {} }));
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
