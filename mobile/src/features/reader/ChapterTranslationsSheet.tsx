// The Bible chapter's translations, from the reader (the web's Reader settings → BibleTranslationToolbar): the same
// Your Bibles controls as Settings (settings/BibleTranslationControls.tsx, as the web's toolbar renders the shared
// BibleTranslationControls), with each Bible's Show switch setting it beside this chapter. Which comparisons show is
// this chapter's own state (its `translation`/`compare` params, carried to the chapters next to it), as on the web;
// the saved library, the default Bible and the JST choice are the device's (storage/bibleLibrary.ts).

import BibleTranslationControls from "../settings/BibleTranslationControls";
import Sheet from "../../components/Sheet";

export default function ChapterTranslationsSheet({
  visible,
  onClose,
  shown,
  onShownChange,
}: {
  visible: boolean;
  onClose: () => void;
  shown: readonly string[];
  onShownChange: (id: string, on: boolean) => void;
}) {
  return (
    <Sheet visible={visible} title="Bible translations" onClose={onClose} testID="chapter-translations">
      <BibleTranslationControls shown={[...shown]} onShownChange={onShownChange} />
    </Sheet>
  );
}
