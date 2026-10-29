import type { ComponentRef, Ref } from "react";
import { Pressable } from "react-native";
import { useTheme } from "../theme/theme";
import { Icon, type IconName } from "./ui";

export default function RoundButton({ icon, label, onPress, testID, size = 15, buttonRef }: { icon: IconName; label: string; onPress: () => void; testID?: string; size?: number; buttonRef?: Ref<ComponentRef<typeof Pressable>> }) {
  const { colors } = useTheme();
  return (
    <Pressable
      ref={buttonRef}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.surfaceCardSoft : "transparent" })}
    >
      <Icon name={icon} size={size} color={colors.foregroundSoft} />
    </Pressable>
  );
}
