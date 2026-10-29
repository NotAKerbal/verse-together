// The small controls beside a verse (the web's VerseStudyPathMarker and VerseInsightMarker): a light bulb where a
// study path begins, and "Note" (or "2 notes") where one of the reader's journal notes links to the verse. They sit
// in a gutter to the right of the native text, each at its verse's first line (ScriptureText's verseTop), and are
// placed again whenever the text lays out anew (a font size, width or rotation change).

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "../../components/ui";
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
  pathVerses: readonly number[];
  openPathVerse: number | null;
  notes: ReadonlyMap<number, VerseNoteRef[]>;
  onTogglePaths: (verse: number) => void;
  onOpenNotes: (verse: number, refs: VerseNoteRef[]) => void;
};

export default function VerseMarkers({ textRef, layoutKey, left, pathVerses, openPathVerse, notes, onTogglePaths, onOpenNotes }: Props) {
  const { colors } = useTheme();
  const [tops, setTops] = useState<ReadonlyMap<number, number>>(new Map());
  const verses = [...new Set([...pathVerses, ...notes.keys()])].sort((a, b) => a - b);
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
        const hasPath = pathVerses.includes(verse);
        const open = openPathVerse === verse;
        const refs = notes.get(verse) ?? [];
        return (
          <View key={verse} pointerEvents="box-none" style={{ position: "absolute", top: Math.max(0, top - 2), ...(left === undefined ? { right: 0 } : { left }), width: MARKER_GUTTER, alignItems: "center", gap: 2 }}>
            {hasPath ? (
              <Pressable
                testID={`study-path-marker-${verse}`}
                accessibilityRole="button"
                accessibilityLabel={`${open ? "Hide" : "Explore"} study path for verse ${verse}`}
                accessibilityState={{ expanded: open }}
                hitSlop={6}
                onPress={() => onTogglePaths(verse)}
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: open ? colors.accentRubric : "transparent",
                  backgroundColor: open ? colors.surfaceCardSoft : pressed ? colors.surfaceButtonHover : "transparent",
                })}
              >
                <Icon name="lightbulb" size={14} color={open ? colors.accentRubric : colors.foregroundSoft} />
              </Pressable>
            ) : null}
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
