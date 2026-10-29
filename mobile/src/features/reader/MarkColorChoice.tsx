import { Pressable, Text, View } from "react-native";
import { MARK_COLORS, isCustomMarkColor, markColorLabel, type MarkColor, type MarkKind } from "../../shared/web";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import MarkSample from "./MarkSample";
import { CustomMarkColor } from "./MarkStylePicker";

type Choice = MarkColor | "none";

export default function MarkColorChoice({ kind, value, disabled = false, testIDPrefix, onChange }: { kind: MarkKind; value: Choice; disabled?: boolean; testIDPrefix: string; onChange: (color: Choice) => void }) {
  const { colors } = useTheme();
  const title = kind === "highlight" ? "Highlight" : "Underline";
  const options: Choice[] = ["none", ...MARK_COLORS, ...(isCustomMarkColor(value) ? [value] : [])];
  return (
    <View style={{ gap: 6, opacity: disabled ? 0.6 : 1 }}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.foregroundMuted }}>{title}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={title} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
        {options.map((option) => {
          const active = option === value;
          const label = option === "none" ? "None" : markColorLabel(option);
          return (
            <Pressable
              key={option}
              testID={`${testIDPrefix}-${kind}-${option}`}
              accessibilityRole="radio"
              accessibilityLabel={option === "none" ? `No ${kind}` : `${label} ${kind}`}
              accessibilityState={{ checked: active, disabled }}
              disabled={disabled}
              onPress={() => onChange(option)}
              style={{
                minHeight: 36,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 8,
                borderRadius: 8,
                borderWidth: active ? 2 : 1,
                borderColor: active ? colors.foreground : colors.surfaceBorder,
                backgroundColor: active ? colors.surfaceCardSoft : colors.surfaceButton,
              }}
            >
              {option === "none" ? <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.surfaceBorder }} /> : <MarkSample preset={{ kind, color: option }} size={12} />}
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foreground }}>{label}</Text>
            </Pressable>
          );
        })}
        <CustomMarkColor value={value} kind={kind} label={title} disabled={disabled} onChange={onChange} />
      </View>
    </View>
  );
}
