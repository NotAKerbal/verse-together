"use client";

import DictionaryEntryBody from "@/components/DictionaryEntryBody";
import WordStudyEntry from "@/components/WordStudyEntry";

type DictionaryEntry = {
  id: string;
  word: string;
  heading: string | null;
  entryText: string;
  pronounce: string | null;
};

export default function DictionaryEntryCard({ entry, edition }: {
  entry: DictionaryEntry;
  edition: "1828" | "1844" | "1913";
}) {
  return (
    <WordStudyEntry
      entry={{
        edition,
        word: entry.word?.trim() || "Dictionary entry",
        heading: entry.heading,
        pronounce: entry.pronounce,
        entryText: entry.entryText,
      }}
      title="Add this dictionary card to a note"
    >
      {entry.pronounce || entry.heading ? (
        <p className="text-xs text-[color:var(--foreground-muted)]">
          {[entry.pronounce, entry.heading].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <DictionaryEntryBody entryText={entry.entryText} />
    </WordStudyEntry>
  );
}
