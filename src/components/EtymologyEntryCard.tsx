"use client";

import WordStudyEntry from "@/components/WordStudyEntry";

type EtymologyItem = {
  id: string;
  source: string;
  word: string;
  text: string;
};

export default function EtymologyEntryCard({ item }: { item: EtymologyItem }) {
  return (
    <WordStudyEntry
      entry={{
        edition: "ETY",
        word: item.word?.trim() || "Etymology",
        heading: item.source?.trim() || "Etymology",
        entryText: item.text?.trim() || "",
      }}
      title="Add this etymology card to a note"
    >
      <p className="whitespace-pre-line break-words">{item.text}</p>
    </WordStudyEntry>
  );
}
