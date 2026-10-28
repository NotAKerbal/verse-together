import { useState } from "react";
import EntryEditor from "../../../src/features/journal/EntryEditor";
import { takeDraftIntent, type DraftIntent } from "../../../src/features/journal/draftIntent";
import { localDateKey } from "../../../src/shared/web";

export default function NewEntryScreen() {
  // The intent is taken once, when the composer opens; a fresh composer is a blank personal note for today.
  const [intent] = useState<DraftIntent>(() => takeDraftIntent() ?? { source: null, body: "", reading: false, journalDate: localDateKey() });
  return <EntryEditor mode="new" intent={intent} />;
}
