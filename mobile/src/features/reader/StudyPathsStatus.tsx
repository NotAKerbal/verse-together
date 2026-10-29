// The line above a chapter's text that says its study paths are being researched for the signed-in reader, or that
// researching (or reaching the site) failed, with Try again. Says nothing while they load from the cache, once they
// are shown as verse markers, or when the chapter has none.

import { Pressable, Text, View } from "react-native";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import type { StudyPathsState } from "./useChapterStudy";

export default function StudyPathsStatus({ paths }: { paths: StudyPathsState & { retry: () => void } }) {
  const { colors } = useTheme();
  const small = { fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, color: colors.foregroundMuted } as const;
  if (paths.status === "generating") {
    return (
      <View testID="study-paths-status" style={{ paddingBottom: 10 }}>
        <Text accessibilityLiveRegion="polite" style={small}>
          Researching study paths for this chapter… This can take up to a minute.
        </Text>
      </View>
    );
  }
  if (paths.status !== "failed") return null;
  return (
    <View testID="study-paths-status" accessibilityRole="alert" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, paddingBottom: 10 }}>
      <Text style={{ ...small, color: colors.accentRubric }}>{`Study paths: ${paths.message}`}</Text>
      <Pressable
        testID="retry-study-paths"
        accessibilityRole="button"
        accessibilityLabel="Try again"
        onPress={paths.retry}
        hitSlop={10}
        style={{ minHeight: 32, justifyContent: "center" }}
      >
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.foreground, textDecorationLine: "underline" }}>Try again</Text>
      </Pressable>
    </View>
  );
}
