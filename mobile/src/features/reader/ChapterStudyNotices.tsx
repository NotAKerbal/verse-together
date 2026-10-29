// The lines above a chapter's text that say what else it shows (ChapterReader.tsx's header notices): the key to
// comparison colors, comparisons still loading or that couldn't load (with Try again), and the Joseph Smith
// Translation's state: loading, none for this chapter, how many passages read in place (with showing or hiding the
// KJV words it leaves out), or a failure with Try again.

import { Pressable, Text, View } from "react-native";
import type { JstChapterReading, JstView } from "@/lib/jst";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";

type Legend = { id: string; label: string; title: string; color: string };

function Link({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={10} style={{ minHeight: 32, justifyContent: "center" }}>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.foreground, textDecorationLine: "underline" }}>{label}</Text>
    </Pressable>
  );
}

export default function ChapterStudyNotices({
  primary,
  legend,
  pending,
  notices,
  onRetryComparisons,
  jst,
  jstReading,
  jstOmitsWording,
  showJstOmitted,
  onToggleJstOmitted,
}: {
  primary: { label: string; title: string; color: string };
  legend: Legend[];
  pending: string[];
  notices: string[];
  onRetryComparisons: () => void;
  jst: JstView & { retry: () => void };
  jstReading: JstChapterReading;
  jstOmitsWording: boolean;
  showJstOmitted: boolean;
  onToggleJstOmitted: () => void;
}) {
  const { colors } = useTheme();
  const small = { fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, color: colors.foregroundMuted } as const;
  const warning = { ...small, color: colors.accentRubric } as const;
  const passages = jstReading.integrated.length;
  const empty = !legend.length && !pending.length && !notices.length && jst.status === "off";
  if (empty) return null;
  return (
    <View testID="chapter-study-notices" style={{ gap: 4, paddingBottom: 10 }}>
      {legend.length ? (
        <Text accessibilityLabel={`Key: ${primary.title}, then ${legend.map((item) => item.title).join(", ")}`} style={small}>
          <Text style={{ color: colors.foregroundSoft }}>Key: </Text>
          <Text style={{ color: primary.color }}>{primary.label}</Text>
          <Text style={{ color: colors.foregroundSoft }}> / </Text>
          {legend.map((item, index) => (
            <Text key={item.id} style={{ color: item.color }}>
              {index > 0 ? ", " : ""}
              {item.label}
            </Text>
          ))}
        </Text>
      ) : null}
      {pending.length ? (
        <Text accessibilityLiveRegion="polite" style={small}>{`Loading ${pending.map((id) => id.toUpperCase()).join(", ")} for comparison…`}</Text>
      ) : null}
      {notices.length ? (
        <View accessibilityRole="alert" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8 }}>
          {notices.map((notice) => (
            <Text key={notice} style={warning}>{notice}</Text>
          ))}
          {notices.some((notice) => notice.startsWith("Could not load")) ? <Link label="Try again" onPress={onRetryComparisons} testID="retry-comparisons" /> : null}
        </View>
      ) : null}
      {jst.status === "loading" ? (
        <Text accessibilityLiveRegion="polite" style={small}>Loading Joseph Smith Translation excerpts…</Text>
      ) : jst.status === "empty" ? (
        <Text accessibilityLiveRegion="polite" style={small}>The JST appendix has no excerpts for this chapter.</Text>
      ) : jst.status === "ready" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8 }}>
          <Text accessibilityLiveRegion="polite" style={small}>
            {passages > 0
              ? `${passages === 1 ? "1 JST passage" : `${passages} JST passages`} read in place of the KJV; JST wording is underlined. Turn off the JST to highlight or note those verses.`
              : "The JST appendix has a note for this chapter."}
          </Text>
          {jstOmitsWording ? (
            <Link label={showJstOmitted ? "Hide omitted KJV words" : "Show omitted KJV words"} onPress={onToggleJstOmitted} testID="toggle-jst-omitted" />
          ) : null}
        </View>
      ) : jst.status === "failed" ? (
        <View accessibilityRole="alert" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8 }}>
          <Text style={warning}>{`Couldn't load Joseph Smith Translation excerpts. ${jst.message}`}</Text>
          <Link label="Try again" onPress={jst.retry} testID="retry-jst" />
        </View>
      ) : null}
    </View>
  );
}
