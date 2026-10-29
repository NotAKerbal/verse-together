// One Joseph Smith Translation appendix section that can't be read in place, shown whole above the chapter text
// (the web's JstExcerptCard.tsx): the Book of Moses note, or a section with no KJV verses in this text to read it
// against. It keeps the source's JST label and verse numbers and isn't part of the selectable verse text.

import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { formatJstSpans, type JstExcerpt } from "@/lib/jst";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";

export default function JstExcerptCard({ excerpt }: { excerpt: JstExcerpt }) {
  const { colors } = useTheme();
  const router = useRouter();
  const mentionsMoses = !!excerpt.note && /book of moses/i.test(excerpt.note);
  const name = excerpt.label.replace(/^JST,\s*/, "");
  const several = excerpt.comparedSpans.length > 0 && excerpt.compareReference.split(",").length > 1;
  return (
    <View
      testID={`jst-excerpt-${excerpt.id}`}
      accessibilityLabel={`Joseph Smith Translation, ${name}`}
      style={{
        marginBottom: 12,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderLeftWidth: 4,
        borderColor: colors.surfaceBorder,
        borderLeftColor: colors.accentPrimary,
        backgroundColor: colors.surfaceCard,
        gap: 4,
      }}
    >
      <Text style={{ fontFamily: fonts.sans, fontSize: 11, letterSpacing: 0.6, color: colors.foregroundSoft }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.foregroundMuted }}>{excerpt.label.toUpperCase()}</Text>
        {"  "}
        {excerpt.compareReference
          ? `COMPARE ${excerpt.compareReference.toUpperCase()}${several ? ` (VERSES ${formatJstSpans(excerpt.comparedSpans)} IN THIS CHAPTER)` : ""}`
          : "THE SOURCE GIVES NO MATCHING KJV VERSE"}
      </Text>
      {excerpt.verses.map((verse, index) => (
        <Text key={`${verse.number}-${index}`} style={{ fontFamily: fonts.serif, fontSize: 15, lineHeight: 24, color: colors.foreground }}>
          {verse.number ? (
            <Text accessibilityLabel={`JST verse ${verse.number}`} style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.foregroundSoft }}>
              {`${verse.number}  `}
            </Text>
          ) : null}
          {verse.text}
        </Text>
      ))}
      {excerpt.note ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.foregroundMuted }}>{excerpt.note}</Text>
      ) : null}
      {mentionsMoses ? (
        <Pressable accessibilityRole="link" onPress={() => router.push("/browse/pearl/moses/1" as never)} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.foreground, textDecorationLine: "underline" }}>Read the Book of Moses</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
