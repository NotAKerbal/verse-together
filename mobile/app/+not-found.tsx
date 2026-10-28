import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Button } from "../src/components/ui";
import { useTheme } from "../src/theme/theme";
import { fonts } from "../src/theme/tokens";

export default function NotFound() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "flex-start", justifyContent: "center", padding: 24, gap: 16, backgroundColor: colors.background }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 30, color: colors.foreground }}>
        This page isn’t here.
      </Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: colors.foregroundMuted }}>The link may be old, or the page may only exist on the website.</Text>
      <Button label="Go to Browse" onPress={() => router.replace("/browse")} />
    </View>
  );
}
