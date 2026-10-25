import type { JournalEntryInput } from "../../src/features/notes/useJournalEntryActions";

const requests = new Map<string, string>();
let failed = false;
export function useJournalEntryActions() {
  return {
    createEntry: async (input: JournalEntryInput) => {
      const existing = requests.get(input.requestId);
      if (existing) return { id: existing, duplicate: true };
      await new Promise(resolve => setTimeout(resolve, 150));
      if (new URLSearchParams(location.search).has("saveError") && !failed) {
        failed = true;
        throw new Error("Synthetic save failure");
      }
      const now = new Date().toISOString();
      const id = `qa-entry-${Date.now()}`;
      requests.set(input.requestId, id);
      window.dispatchEvent(new CustomEvent("qa-entry", { detail: {
        id, title: input.markdownBody.split("\n")[0].replace(/^#+\s*/, "") || "Untitled note",
        status: "draft", markdown_body: input.markdownBody, markdown_revision: 0, markdown_canonical: true,
        journal_date: input.journalDate, source: input.source ?? null, reading_at: input.logReading ? now : null,
        created_at: now, updated_at: now,
      } }));
      return { id, duplicate: false };
    },
    setEntryReading: async (id: string, logged: boolean) => {
      window.dispatchEvent(new CustomEvent("qa-entry-reading", { detail: { id, logged } }));
      return { ok: true };
    },
  };
}
