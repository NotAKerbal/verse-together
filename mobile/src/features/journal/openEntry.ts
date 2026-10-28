import type { useRouter } from "expo-router";
import { toAppHref } from "../../navigation/hrefs";
import type { JournalEntry } from "../../shared/web";
import { journalStudy } from "../../storage/journalData";

/**
 * A note opens in its editor; an older verse note (read-only in the journal) opens its verse in the reader; a reading
 * logged in the account opens as an editable entry, made once by the account (online). `onError` hears why one
 * couldn't open.
 */
export function openJournalEntry(router: ReturnType<typeof useRouter>, entry: JournalEntry, onError?: (message: string) => void) {
  if (entry.kind === "note") router.push(`/notes/entry/${encodeURIComponent(entry.id)}` as never);
  else if (entry.kind === "verse_annotation") router.push(toAppHref(entry.source.href) as never);
  else {
    journalStudy.openReading(entry).then(
      (id) => router.push(`/notes/entry/${encodeURIComponent(id)}` as never),
      (error: unknown) => onError?.(error instanceof Error && /offline|checked/i.test(error.message) ? error.message : "This reading couldn't be opened. Check your connection and try again."),
    );
  }
}
