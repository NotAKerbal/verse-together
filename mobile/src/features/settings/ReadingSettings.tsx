// Settings → Reading (src/features/settings/ReadingSettings.tsx): a preview of John 1:1–3 as the reader sets it, the
// faith tradition, Scripture appearance (text size, typeface, text width and comparison view, with what each does and
// a Reset), and Simple mode. The same preferences, saved the same way, as Reader settings: the account's when signed
// in, this device's otherwise.

import { useRef, useState } from "react";
import { Pressable, Text, View, type GestureResponderEvent } from "react-native";
import {
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  defaultPreferences,
  useReaderPreferences,
  useReaderPreferencesReady,
  useSimpleMode,
  type ComparisonView,
  type ReaderPreferences,
  type ReaderTextWidth,
} from "../../storage/preferences";
import { useTheme } from "../../theme/theme";
import { fonts, radii, REM } from "../../theme/tokens";
import FaithTraditionSettings from "./FaithTraditionSettings";
import { ACCOUNT_SETTINGS_LOADING, usePreferencesPlace } from "./preferencesPlace";
import { CardHeader, SettingRow, SettingSwitch, SettingsCard, TextButton } from "./SettingsParts";

// Public-domain King James text.
const SAMPLE_VERSES = [
  { verse: 1, text: "In the beginning was the Word, and the Word was with God, and the Word was God." },
  { verse: 2, text: "The same was in the beginning with God." },
  { verse: 3, text: "All things were made by him; and without him was not any thing made that was made." },
];

type Option<T extends string> = { value: T; label: string };

const TYPEFACE_OPTIONS: ReadonlyArray<Option<ReaderPreferences["fontFamily"]>> = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans" },
];

const TEXT_WIDTH_OPTIONS: ReadonlyArray<Option<ReaderTextWidth>> = [
  { value: "comfortable", label: "Comfortable" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
];

const COMPARISON_OPTIONS: ReadonlyArray<Option<ComparisonView>> = [
  { value: "inline", label: "Inline" },
  { value: "sideBySide", label: "Side by side" },
];

const COMPARISON_DESCRIPTIONS: Record<ComparisonView, string> = {
  inline: "Compared translations follow each verse that differs.",
  sideBySide: "Compared translations sit beside each verse that differs.",
};

const TEXT_WIDTH_LABELS: Record<ReaderTextWidth, string> = { comfortable: "Comfortable", wide: "Wide", full: "Full" };

// The app's reader on a phone fills the screen at every width; Wide and Full matter on tablets.
const TEXT_WIDTH_DESCRIPTIONS: Record<ReaderTextWidth, string> = {
  comfortable: "A centered column for steady reading.",
  wide: "A wider column on large screens.",
  full: "Verses run the full width of the screen.",
};

const SIZE_STEP = 0.05;

function clampScale(value: number) {
  return Math.round(Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value)) * 100) / 100;
}

/** Text size, typeface, width and comparison view as the reader stores them, with a hair's tolerance for the scale. */
export function isDefaultAppearance(prefs: ReaderPreferences): boolean {
  const base = defaultPreferences();
  return (
    Math.abs(prefs.fontScale - base.fontScale) < 0.005 &&
    prefs.fontFamily === base.fontFamily &&
    prefs.textWidth === base.textWidth &&
    prefs.comparisonView === base.comparisonView
  );
}

/** The fieldset's legend and its row of joined buttons (ReaderAppearanceControls' Segmented). */
function Choice<T extends string>({
  legend,
  description,
  options,
  value,
  onSelect,
  disabled = false,
}: {
  legend: string;
  description?: string;
  options: ReadonlyArray<Option<T>>;
  value: T;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.75 * REM, letterSpacing: 0.025 * 0.75 * REM, color: colors.foreground, opacity: 0.8 }}>{legend}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={legend}
        style={{ flexDirection: "row", overflow: "hidden", borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.sm, opacity: disabled ? 0.45 : 1 }}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => {
                if (!selected && !disabled) onSelect(option.value);
              }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 40,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 12,
                borderLeftWidth: index > 0 ? 1 : 0,
                borderLeftColor: colors.surfaceBorder,
                backgroundColor: selected ? colors.foreground : pressed ? colors.surfaceButtonHover : "transparent",
              })}
            >
              <Text style={{ fontFamily: fonts.sans, fontSize: 0.875 * REM, color: selected ? colors.background : colors.foreground }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {description ? <Text style={{ fontFamily: fonts.sans, fontSize: 11, lineHeight: 16, color: colors.foregroundMuted }}>{description}</Text> : null}
    </View>
  );
}

/**
 * The text-size slider: a filled bar from 85% to 130%. A touch or drag anywhere on it sets the size; it keeps the
 * gesture once it has it, so a sideways drag doesn't scroll the page. Screen readers step it by 5%.
 */
function TextSizeSlider({ value, onChange, disabled = false }: { value: number; onChange: (next: number) => void; disabled?: boolean }) {
  const { colors, scheme } = useTheme();
  const width = useRef(0);
  const percent = Math.round(value * 100);
  const fill = ((value - MIN_FONT_SCALE) / (MAX_FONT_SCALE - MIN_FONT_SCALE)) * 100;
  const at = (event: GestureResponderEvent) => {
    if (disabled || width.current <= 0) return;
    const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / width.current));
    const next = clampScale(MIN_FONT_SCALE + ratio * (MAX_FONT_SCALE - MIN_FONT_SCALE));
    if (next !== value) onChange(next);
  };
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.75 * REM, letterSpacing: 0.025 * 0.75 * REM, color: colors.foreground, opacity: 0.8 }}>Text size</Text>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.75 * REM, color: colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>{`${percent}%`}</Text>
      </View>
      <View
        testID="settings-text-size"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Text size"
        accessibilityValue={{ min: Math.round(MIN_FONT_SCALE * 100), max: Math.round(MAX_FONT_SCALE * 100), now: percent, text: `${percent}%` }}
        accessibilityState={{ disabled }}
        accessibilityActions={disabled ? [] : [{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (!disabled) onChange(clampScale(value + (event.nativeEvent.actionName === "increment" ? SIZE_STEP : -SIZE_STEP)));
        }}
        onLayout={(event) => {
          width.current = event.nativeEvent.layout.width;
        }}
        onStartShouldSetResponder={() => !disabled}
        onResponderTerminationRequest={() => false}
        onResponderGrant={at}
        onResponderMove={at}
        style={{ height: 40, borderRadius: radii.sm, overflow: "hidden", opacity: disabled ? 0.45 : 1, backgroundColor: scheme === "dark" ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.1)" }}
      >
        <View pointerEvents="none" style={{ width: `${fill}%`, height: "100%", borderRadius: radii.sm, backgroundColor: colors.foreground }} />
      </View>
    </View>
  );
}

/** John 1:1–3 in the reader's own face and size (the chapter screen's 16pt × scale, 1.75 line height). */
function Preview({ prefs }: { prefs: ReaderPreferences }) {
  const { colors } = useTheme();
  const size = 16 * prefs.fontScale;
  const face = prefs.fontFamily === "sans" ? fonts.sans : fonts.serif;
  return (
    <SettingsCard testID="reading-preview">
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          columnGap: 12,
          rowGap: 4,
          paddingBottom: 0.6 * REM,
          borderBottomWidth: 1,
          borderBottomColor: colors.rule,
        }}
      >
        <Text style={{ fontFamily: fonts.sans, fontSize: 0.7 * REM, color: colors.foregroundMuted }}>Preview · John 1:1–3</Text>
        <Text testID="reading-preview-summary" style={{ fontFamily: fonts.sans, fontSize: 0.7 * REM, color: colors.foregroundMuted }}>
          {`${Math.round(prefs.fontScale * 100)}% · ${prefs.fontFamily === "sans" ? "Sans" : "Serif"} · ${TEXT_WIDTH_LABELS[prefs.textWidth]} width`}
        </Text>
      </View>
      <View style={{ paddingTop: 8 }}>
        {SAMPLE_VERSES.map((verse) => (
          <Text key={verse.verse} style={{ paddingVertical: 8, fontFamily: face, fontSize: size, lineHeight: size * 1.75, color: colors.foreground }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5 * Math.max(1, prefs.fontScale * 0.9), color: colors.accentRubric }}>{`${verse.verse}  `}</Text>
            {verse.text}
          </Text>
        ))}
      </View>
    </SettingsCard>
  );
}

export default function ReadingSettings() {
  const { colors } = useTheme();
  const [prefs, savePrefs] = useReaderPreferences();
  const [simple, saveSimple] = useSimpleMode();
  const [error, setError] = useState<string | null>(null);
  // An account's appearance can't change until its own copy has been read (simple mode is this device's).
  const ready = useReaderPreferencesReady();
  const atDefaults = isDefaultAppearance(prefs);
  const place = usePreferencesPlace();
  /** A write the device refuses leaves the setting as it was and says so. */
  const attempt = (write: () => boolean | void) => {
    try {
      setError(write() === false ? ACCOUNT_SETTINGS_LOADING : null);
    } catch {
      setError("Couldn't save this on the device. Try again.");
    }
  };
  const setPrefs = (next: ReaderPreferences) => attempt(() => savePrefs(next));
  const setSimple = (next: boolean) => attempt(() => saveSimple(next));
  const set = <K extends "fontScale" | "fontFamily" | "textWidth" | "comparisonView">(key: K, value: ReaderPreferences[K]) => {
    if (prefs[key] !== value) setPrefs({ ...prefs, [key]: value });
  };
  return (
    <View style={{ gap: 0.75 * REM }}>
      <Preview prefs={prefs} />
      <FaithTraditionSettings />
      <SettingsCard label="Scripture appearance">
        <CardHeader
          title="Scripture appearance"
          meta={`${place} · Also in Reader settings`}
          action={
            <TextButton
              icon="rotate-left"
              label="Reset"
              accessibilityLabel="Reset scripture appearance"
              disabled={atDefaults || !ready}
              onPress={() => {
                const base = defaultPreferences();
                setPrefs({ ...prefs, fontScale: base.fontScale, fontFamily: base.fontFamily, textWidth: base.textWidth, comparisonView: base.comparisonView });
              }}
            />
          }
        />
        <View style={{ gap: 1 * REM, paddingBottom: 4 }}>
          <TextSizeSlider value={prefs.fontScale} disabled={!ready} onChange={(value) => set("fontScale", value)} />
          <Choice
            legend="Typeface"
            description="The typeface for scripture text. Controls and labels stay the same."
            options={TYPEFACE_OPTIONS}
            value={prefs.fontFamily}
            disabled={!ready}
            onSelect={(value) => set("fontFamily", value)}
          />
          <Choice
            legend="Text width"
            description={TEXT_WIDTH_DESCRIPTIONS[prefs.textWidth]}
            options={TEXT_WIDTH_OPTIONS}
            value={prefs.textWidth}
            disabled={!ready}
            onSelect={(value) => set("textWidth", value)}
          />
          <Choice
            legend="Comparison view"
            description={COMPARISON_DESCRIPTIONS[prefs.comparisonView]}
            options={COMPARISON_OPTIONS}
            value={prefs.comparisonView}
            disabled={!ready}
            onSelect={(value) => set("comparisonView", value)}
          />
        </View>
      </SettingsCard>
      <SettingsCard label="Simple mode">
        <SettingRow title="Simple mode" meta={`${simple ? "Study tools hidden" : "Study tools visible"} · This device`} metaLive>
          <SettingSwitch value={simple} onChange={setSimple} label="Simple mode" testID="settings-simple-mode" />
        </SettingRow>
      </SettingsCard>
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ fontFamily: fonts.sans, fontSize: 0.76 * REM, color: colors.accentRubric }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
