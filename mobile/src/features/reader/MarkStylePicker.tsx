// A visual choice of a mark's style (MarkStylePicker.tsx and .mark-picker in globals.css): highlight or underline,
// each shown as it marks a letter, and one of the palette or custom colors, drawn as the chosen kind marks (a dot
// for a highlight, a rule for an underline). Two radio groups. Picking only chooses; whatever shows the picker
// decides when the style is applied.
//
// Custom: the web opens the browser's color picker; here a hex field takes any #rrggbb color, checked by the same
// rule (isMarkColor), and the color joins the swatches so it can be picked again with one tap.

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  MARK_COLORS,
  MARK_KINDS,
  customMarkColors,
  isCustomMarkColor,
  isMarkColor,
  markColorHex,
  markColorLabel,
  type MarkColor,
  type MarkKind,
} from "../../shared/web";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import MarkSample from "./MarkSample";
import { swatch } from "./marks";

export type MarkStyle = { kind: MarkKind; color: MarkColor };

const KIND_LABELS: Record<MarkKind, string> = { highlight: "Highlight", underline: "Underline" };

/** "#3A7BD5", "3a7bd5" or " #3a7bd5 " → "#3a7bd5"; anything else → null. */
export function parseCustomColor(raw: string): MarkColor | null {
  const value = raw.trim().toLowerCase();
  const color = value.startsWith("#") ? value : `#${value}`;
  return isMarkColor(color) && color.startsWith("#") ? color : null;
}

function Swatch({ kind, color }: { kind: MarkKind; color: string }) {
  const { colors } = useTheme();
  return kind === "underline" ? (
    <View style={{ width: 22, height: 5, borderRadius: 3, backgroundColor: color }} />
  ) : (
    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: color, borderWidth: 1, borderColor: colors.surfaceBorder }} />
  );
}

export function CustomMarkColor({ value, kind, label, disabled, onChange }: { value: MarkColor | "none"; kind: MarkKind; label: string; disabled: boolean; onChange: (color: MarkColor) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const current = markColorHex(value === "none" ? "red" : value);
  const shown = parseCustomColor(draft) ?? current;
  const custom = isCustomMarkColor(value);

  const commit = () => {
    const color = parseCustomColor(draft);
    if (!color) {
      setError("Enter a color as six hex digits, like #3a7bd5.");
      return;
    }
    setError(null);
    setOpen(false);
    if (color !== value) onChange(color);
  };

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        testID="mark-custom"
        accessibilityRole="button"
        accessibilityLabel={`${label} custom color`}
        accessibilityHint="Enter any color as a hex value"
        accessibilityState={{ expanded: open, disabled, selected: custom }}
        disabled={disabled}
        onPress={() => {
          // Opens on the color already chosen (a palette color as its swatch), as the web's picker does.
          setDraft(current);
          setError(null);
          setOpen(!open);
        }}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          minHeight: 36,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.surfaceBorder,
          backgroundColor: pressed || open ? colors.surfaceCardSoft : "transparent",
          opacity: disabled ? 0.35 : 1,
        })}
      >
        <Swatch kind={kind} color={current} />
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: open ? colors.foreground : colors.foregroundSoft }}>Custom</Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.surfaceBorder }}>
              <MarkSample preset={{ kind, color: shown }} size={13} />
            </View>
            <TextInput
              testID="mark-custom-input"
              accessibilityLabel={`${label} custom color, hex`}
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                setError(null);
              }}
              onSubmitEditing={commit}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              maxLength={8}
              returnKeyType="done"
              placeholder="#3a7bd5"
              placeholderTextColor={colors.foregroundSoft}
              style={{ flex: 1, minHeight: 40, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: error ? colors.accentRubric : colors.surfaceBorder, backgroundColor: colors.inputSurface, color: colors.foreground, fontFamily: fonts.mono, fontSize: 15 }}
            />
            <Pressable
              testID="mark-custom-use"
              accessibilityRole="button"
              accessibilityLabel="Use this color"
              onPress={commit}
              style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.foregroundSoft, justifyContent: "center", backgroundColor: pressed ? colors.surfaceCardSoft : "transparent" })}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.foreground }}>Use</Text>
            </Pressable>
          </View>
          {error ? (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ fontFamily: fonts.sans, fontSize: 11, lineHeight: 15, color: colors.accentRubric }}>
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function MarkStylePicker({
  value,
  onChange,
  label,
  disabled = false,
  customColors = [],
}: {
  value: MarkStyle;
  onChange: (next: MarkStyle) => void;
  /** Names the picker's two groups: "<label> style" and "<label> color". */
  label: string;
  disabled?: boolean;
  /** The reader's own custom colors (their quick marks', the ones already on the selection), offered after the palette. */
  customColors?: readonly MarkColor[];
}) {
  const { colors } = useTheme();
  const choices: readonly MarkColor[] = [...MARK_COLORS, ...customMarkColors([...customColors, value.color])];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 6, opacity: disabled ? 0.55 : 1 }}>
      <View accessibilityRole="radiogroup" accessibilityLabel={`${label} style`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {MARK_KINDS.map((kind) => {
          const checked = kind === value.kind;
          return (
            <Pressable
              key={kind}
              testID={`mark-kind-${kind}`}
              accessibilityRole="radio"
              accessibilityLabel={KIND_LABELS[kind]}
              accessibilityState={{ checked, disabled }}
              disabled={disabled}
              onPress={() => {
                if (!checked) onChange({ kind, color: value.color });
              }}
              style={({ pressed }) => ({
                minHeight: 36,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingLeft: checked ? 2 : 3,
                paddingRight: checked ? 9 : 10,
                borderRadius: 10,
                borderWidth: checked ? 2 : 1,
                borderColor: checked ? colors.foreground : colors.surfaceBorder,
                backgroundColor: checked || pressed ? colors.surfaceCardSoft : "transparent",
              })}
            >
              <MarkSample preset={{ kind, color: value.color }} size={13} />
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: checked ? colors.foreground : colors.foregroundSoft }}>{KIND_LABELS[kind]}</Text>
            </Pressable>
          );
        })}
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={`${label} color`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {choices.map((color) => {
          const checked = color === value.color;
          return (
            <Pressable
              key={color}
              testID={`mark-color-${color}`}
              accessibilityRole="radio"
              accessibilityLabel={markColorLabel(color)}
              accessibilityState={{ checked, disabled }}
              disabled={disabled}
              onPress={() => {
                if (!checked) onChange({ kind: value.kind, color });
              }}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: checked ? 2 : 0,
                borderColor: colors.foreground,
                backgroundColor: checked || pressed ? colors.surfaceCardSoft : "transparent",
              })}
            >
              <Swatch kind={value.kind} color={swatch(color)} />
            </Pressable>
          );
        })}
      </View>
      <CustomMarkColor value={value.color} kind={value.kind} label={label} disabled={disabled} onChange={(color) => onChange({ kind: value.kind, color })} />
    </View>
  );
}
