// A volume's or book's header on phones (SelectionHeader.tsx, .browse-selection-header): one pill holding
// Go back, the serif title, and search.

import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSimpleMode } from "../storage/preferences";
import { useTheme } from "../theme/theme";
import { fonts } from "../theme/tokens";
import { IconButton, PillBar } from "./ui";

export function SearchPill({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PillBar style={{ paddingLeft: 16 }}>
      <View style={{ flex: 1 }}>
        <Text
          onPress={onPress}
          accessibilityRole="search"
          accessibilityLabel="Search scriptures"
          accessibilityHint="Opens search for references and words"
          style={{ fontFamily: fonts.sans, fontSize: 16, color: colors.foregroundSoft, paddingVertical: 12 }}
        >
          Search scriptures
        </Text>
      </View>
      <IconButton icon="magnifying-glass" label="Search scriptures" onPress={onPress} />
    </PillBar>
  );
}

export default function SelectionHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [simple] = useSimpleMode();
  return (
    <PillBar style={{ paddingLeft: onBack ? 6 : 18 }}>
      {onBack ? <IconButton icon="chevron-left" label="Go back" onPress={onBack} /> : null}
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={{ flex: 1, paddingHorizontal: 4, fontFamily: fonts.serif, fontSize: 18, lineHeight: 22, color: colors.foreground }}
      >
        {title}
      </Text>
      {simple ? null : <IconButton icon="magnifying-glass" label="Search scriptures" onPress={() => router.push("/search")} />}
    </PillBar>
  );
}
