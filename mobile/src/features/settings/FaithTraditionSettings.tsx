// Settings → Reading → Faith tradition (src/features/settings/FaithTraditionSettings.tsx): the content this device
// shows. Other denominations keeps Bible reading and the journal and hides Latter-day Saint scriptures, Come, Follow
// Me, the Joseph Smith Translation and study resources. Kept on this device only, as on the web.

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FAITH_TRADITIONS, useFaithTradition } from "../../storage/faithTradition";
import { useTheme } from "../../theme/theme";
import { fonts, radii, REM } from "../../theme/tokens";
import { CardHeader, SettingsCard } from "./SettingsParts";

export default function FaithTraditionSettings() {
  const { colors } = useTheme();
  const { tradition, setTradition } = useFaithTradition();
  const [error, setError] = useState(false);
  return (
    <SettingsCard label="Faith tradition" testID="faith-tradition">
      <CardHeader title="Faith tradition" />
      <Text style={{ marginTop: -0.6 * REM, marginBottom: 0.75 * REM, fontFamily: fonts.sans, fontSize: 0.8 * REM, lineHeight: 0.8 * REM * 1.55, color: colors.foregroundMuted }}>
        Choose the content you see · This device. Other denominations keeps Bible reading and your journal, and hides Latter-day Saint scriptures, Come Follow
        Me, Joseph Smith Translation and study resources.
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Faith tradition" style={{ gap: 8, paddingBottom: 6 }}>
        {FAITH_TRADITIONS.map((option) => {
          const selected = tradition === option.id;
          return (
            <Pressable
              key={option.id}
              testID={`faith-${option.id}`}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
              onPress={() => {
                if (!selected) setError(!setTradition(option.id));
              }}
              style={({ pressed }) => ({
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: selected ? colors.foreground : colors.surfaceBorder,
                backgroundColor: pressed ? colors.surfaceButtonHover : selected ? colors.surfaceCardSoft : "transparent",
              })}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? colors.foreground : colors.ruleStrong, alignItems: "center", justifyContent: "center" }}>
                {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.foreground }} /> : null}
              </View>
              <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 0.875 * REM, lineHeight: 0.875 * REM * 1.4, color: colors.foreground }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ fontFamily: fonts.sans, fontSize: 0.76 * REM, color: colors.accentRubric }}>
          This device couldn’t save this preference. Try again.
        </Text>
      ) : null}
    </SettingsCard>
  );
}
