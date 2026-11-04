import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import type { VerseNoteRef } from "./journalRefs";
import type { ScriptureTextHandle } from "./ScriptureText";

/** The gutter's width, kept free of text by the reader's right inset. */
export const MARKER_GUTTER = 48;

type Props = {
  textRef: React.RefObject<ScriptureTextHandle | null>;
  /** Changes whenever the text has laid out again. */
  layoutKey: string;
  /** The gutter's left edge, when the text doesn't reach the right edge (two columns); otherwise it sits at the right. */
  left?: number;
  notes: ReadonlyMap<number, VerseNoteRef[]>;
  onOpenNotes: (verse: number, refs: VerseNoteRef[]) => void;
};

export default function VerseMarkers({ textRef, layoutKey, left, notes, onOpenNotes }: Props) {
  const { colors } = useTheme();
  const [tops, setTops] = useState<ReadonlyMap<number, number>>(new Map());
  const verses = [...notes.keys()].sort((a, b) => a - b);
  const versesKey = verses.join(",");

  useEffect(() => {
    let live = true;
    const list = versesKey ? versesKey.split(",").map(Number) : [];
    void Promise.all(list.map(async (verse) => [verse, (await textRef.current?.verseTop(verse)) ?? -1] as const)).then((entries) => {
      if (live) setTops(new Map(entries.filter(([, top]) => top >= 0)));
    });
    return () => {
      live = false;
    };
  }, [versesKey, layoutKey, textRef]);

  return (
    <>
      {verses.map((verse) => {
        const top = tops.get(verse);
        if (top === undefined) return null;
        const refs = notes.get(verse) ?? [];
        return (
          <View key={verse} pointerEvents="box-none" style={{ position: "absolute", top: Math.max(0, top - 2), ...(left === undefined ? { right: 0 } : { left }), width: MARKER_GUTTER, alignItems: "center", gap: 2 }}>
            {refs.length ? (
              <Pressable
                testID={`note-marker-${verse}`}
                accessibilityRole="button"
                accessibilityLabel={refs.length === 1 ? `Open your note "${refs[0].title}" for verse ${verse}` : `Choose one of ${refs.length} notes for verse ${verse}`}
                hitSlop={6}
                onPress={() => onOpenNotes(verse, refs)}
                style={({ pressed }) => ({ minHeight: 32, minWidth: 40, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: pressed ? colors.surfaceButtonHover : "transparent" })}
              >
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11, color: colors.foregroundMuted, textDecorationLine: "underline" }}>
                  {refs.length === 1 ? "Note" : `${refs.length} notes`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </>
  );
}
