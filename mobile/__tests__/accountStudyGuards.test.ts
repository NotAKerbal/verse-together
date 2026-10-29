// The account outbox refuses, up front, the note changes the server refuses (convex/insights.ts): editing or changing
// the reading of anything but a draft, and deleting a published note. Archived notes may be deleted, as on the web.

import { AccountStudyStore } from "../src/storage/accountStudy";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import type { JournalNoteDocument } from "../src/shared/web";

function doc(id: string, status: JournalNoteDocument["status"]): JournalNoteDocument {
  return {
    id,
    title: id,
    status,
    markdown_body: "Text",
    markdown_revision: 2,
    markdown_canonical: true,
    journal_date: "2026-10-28",
    source: { kind: "scripture", label: "Alma 32", href: "/browse/bookofmormon/alma/32" } as never,
    reading_at: null,
    created_at: "2026-10-28T00:00:00.000Z",
    updated_at: "2026-10-28T00:00:00.000Z",
  } as JournalNoteDocument;
}

let store: AccountStudyStore;
beforeEach(() => {
  setStoragePort(memoryStorage());
  store = new AccountStudyStore("owner-A");
  store.putDoc(doc("draft", "draft"));
  store.putDoc(doc("published", "published"));
  store.putDoc(doc("archived", "archived"));
});

it("saves and changes the reading of drafts only", () => {
  store.enqueueSave("draft", "Edited", 2);
  expect(() => store.enqueueSave("published", "Edited", 2)).toThrow("This entry is published, so it can't be edited.");
  expect(() => store.enqueueSave("archived", "Edited", 2)).toThrow("This entry is archived, so it can't be edited.");
  const reading = { source: doc("x", "draft").source!, journalDate: "2026-10-28" };
  expect(() => store.enqueueReading("published", reading, "Text")).toThrow(/published/);
  expect(() => store.enqueueReading("archived", null, "Text")).toThrow(/archived/);
  store.enqueueReading("draft", reading, "Text");
  expect(store.getSnapshot().outbox.ops.map((op) => [op.kind, "noteId" in op ? op.noteId : null])).toEqual([
    ["save", "draft"],
    ["reading", "draft"],
  ]);
});

it("deletes drafts and archived notes, never a published one", () => {
  expect(() => store.enqueueDelete("published")).toThrow("This entry is published, so it can't be deleted.");
  store.enqueueDelete("archived");
  store.enqueueDelete("draft");
  expect(store.getSnapshot().outbox.ops.map((op) => ("noteId" in op ? op.noteId : null))).toEqual(["archived", "draft"]);
});

it("a status known only from the journal list is honoured too, and a new entry is a draft", () => {
  store.setJournal([{ kind: "note", id: "listed", status: "published", title: "", journal_date: "2026-10-28", source: null, excerpt: "", has_reflection: true, markdown_revision: 0, markdown_canonical: true, reading_at: null, read_only: false, author_label: "You", created_at: "", updated_at: "" } as never]);
  expect(() => store.enqueueSave("listed", "x", 0)).toThrow(/published/);
  const { id } = store.enqueueCreate({ markdownBody: "New", journalDate: "2026-10-28", source: null, logReading: false });
  store.enqueueSave(id, "New, edited", 0);
  store.enqueueDelete(id);
  expect(store.getSnapshot().outbox.ops).toEqual([]);
});
