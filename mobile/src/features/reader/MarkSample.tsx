// A letter marked the way a preset marks a verse (MarkSample.tsx and .mark-sample in globals.css): on a tinted chip
// for a highlight, over a colored rule for an underline. The rule is drawn as its own line, because Android ignores
// textDecorationColor and would underline in the text's color. Decorative: whatever shows it names the mark.

import { Text, View } from "react-native";
import type { MarkPreset } from "../../shared/web";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import { withAlpha } from "../../components/ui";
import { highlightFill, swatch, underlineStroke } from "./marks";

export default function MarkSample({ preset, size = 15 }: { preset: Pick<MarkPreset, "kind" | "color">; size?: number }) {
  const { colors } = useTheme();
  const box = Math.round(size * 1.6);
  const highlight = preset.kind === "highlight";
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID={`mark-sample-${preset.kind}-${preset.color}`}
      style={{
        width: box,
        height: box,
        borderRadius: Math.round(size * 0.3),
        alignItems: "center",
        justifyContent: "center",
        ...(highlight ? { backgroundColor: highlightFill(colors, preset.color), borderWidth: 1, borderColor: withAlpha(swatch(preset.color), 0.7) } : {}),
      }}
    >
      <Text style={{ fontFamily: fonts.serifBold, fontSize: size, lineHeight: Math.round(size * 1.15), color: colors.foreground, includeFontPadding: false }}>A</Text>
      {highlight ? null : (
        <View
          testID={`mark-sample-rule-${preset.color}`}
          style={{ position: "absolute", left: Math.round(size * 0.3), right: Math.round(size * 0.3), bottom: Math.round(size * 0.12), height: 3, borderRadius: 1.5, backgroundColor: underlineStroke(colors, preset.color) }}
        />
      )}
    </View>
  );
}
