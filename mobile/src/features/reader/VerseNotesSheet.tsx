import { Pressable, Text } from "react-native";
import Sheet from "../../components/Sheet";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import type { VerseNoteRef } from "./journalRefs";

export default function VerseNotesSheet({ verse, refs, onChoose, onClose }: { verse: number | null; refs: VerseNoteRef[]; onChoose: (noteId: string) => void; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={verse !== null && refs.length > 0} title={`Notes on verse ${verse ?? ""}`} onClose={onClose} testID="verse-notes">
      {refs.map((ref) => (
        <Pressable
          key={ref.noteId}
          accessibilityRole="button"
          accessibilityLabel={`Open your note "${ref.title}"`}
          onPress={() => onChoose(ref.noteId)}
          style={({ pressed }) => ({ minHeight: 48, justifyContent: "center", paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: pressed ? colors.surfaceButtonHover : colors.surfaceCard })}
        >
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.foreground }}>{ref.title || "Untitled note"}</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundSoft }}>{ref.verseStart === ref.verseEnd ? `v. ${ref.verseStart}` : `vv. ${ref.verseStart}-${ref.verseEnd}`}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}
