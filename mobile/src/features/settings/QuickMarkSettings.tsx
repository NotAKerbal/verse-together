// Settings → Study tools → Quick marks (src/features/annotations/QuickMarkSettings.tsx): the marks across the top of
// the selection menu, in their order, each a highlight or underline in one color and optionally named. Each row:
// its sample and name, move up / move down / remove, then its name field and style picker. Below the list, a new
// mark to add, and Restore defaults. Saved in the reader preferences: this device's (reader_prefs_v1) signed out, the
// account's (saveMarkPresets, through preferencesSync.ts) signed in, as the web saves them.

import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { MARK_PRESET_NAME_MAX, normalizeMarkPreset, normalizeMarkPresetName, sameNamedMarkPreset } from "../../../../convex/annotationRules";
import {
  DEFAULT_MARK_PRESETS,
  MARK_COLORS,
  MARK_KINDS,
  MARK_PRESETS_MAX,
  customMarkColors,
  markPresetFullLabel,
  markPresetLabel,
  markPresetPhrase,
  sameMarkPreset,
  type MarkColor,
  type MarkKind,
  type MarkPreset,
} from "../../shared/web";
import { useReaderPreferences, useReaderPreferencesReady } from "../../storage/preferences";
import { ACCOUNT_SETTINGS_LOADING, usePreferencesPlace } from "./preferencesPlace";
import { useTheme } from "../../theme/theme";
import { fonts, REM } from "../../theme/tokens";
import MarkSample from "../reader/MarkSample";
import MarkStylePicker, { type MarkStyle } from "../reader/MarkStylePicker";
import { CardHeader, SmallIconButton, TextButton } from "./SettingsParts";

function samePresets(a: readonly MarkPreset[], b: readonly MarkPreset[]) {
  return a.length === b.length && a.every((preset, index) => sameNamedMarkPreset(preset, b[index]));
}

function has(presets: readonly MarkPreset[], style: MarkStyle) {
  return presets.some((item) => sameMarkPreset(item, style));
}

/** The first kind-and-color pair not in the list (highlights first), for the add row. */
function firstUnused(presets: readonly MarkPreset[]): MarkPreset | null {
  for (const kind of MARK_KINDS as readonly MarkKind[]) {
    const color = (MARK_COLORS as readonly MarkColor[]).find((item) => !has(presets, { kind, color: item }));
    if (color) return { kind, color };
  }
  return null;
}

function useInputStyle() {
  const { colors } = useTheme();
  return {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 0.5 * REM,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 0.45 * REM,
    backgroundColor: "transparent",
    color: colors.foreground,
    fontFamily: fonts.sans,
    fontSize: 15,
  } as const;
}

/**
 * A preset's optional name. It saves when the field is left (or on Done), not on every keystroke. While the
 * field isn't being edited it follows the saved name.
 */
function PresetNameField({ name, label, onCommit }: { name: string | undefined; label: string; onCommit: (name: string | undefined) => void }) {
  const { colors } = useTheme();
  const inputStyle = useInputStyle();
  const [value, setValue] = useState(name ?? "");
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState(name);
  if (!editing && shown !== name) {
    setShown(name);
    setValue(name ?? "");
  }
  const commit = (text: string) => {
    setEditing(false);
    const next = normalizeMarkPresetName(text);
    setValue(next ?? "");
    if (next !== (name || undefined)) onCommit(next);
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 16 * REM }}>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={`Optional, up to ${MARK_PRESET_NAME_MAX} characters`}
        placeholder="Name (optional)"
        placeholderTextColor={colors.foregroundMuted}
        maxLength={MARK_PRESET_NAME_MAX}
        autoCorrect
        returnKeyType="done"
        value={value}
        onFocus={() => setEditing(true)}
        onChangeText={(text) => {
          setEditing(true);
          setValue(text);
        }}
        onEndEditing={(event) => commit(event?.nativeEvent?.text ?? value)}
        style={inputStyle}
      />
      {editing ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 0.62 * REM, color: colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>
          {`${value.length}/${MARK_PRESET_NAME_MAX}`}
        </Text>
      ) : null}
    </View>
  );
}

function PresetName({ preset }: { preset: MarkPreset }) {
  const { colors } = useTheme();
  const label = markPresetLabel(preset);
  return (
    <Text accessibilityLabel={markPresetFullLabel(preset)} style={{ flex: 1, minWidth: 0, fontFamily: fonts.sans, fontSize: 0.85 * REM, color: colors.foreground }}>
      {preset.name ? (
        <>
          <Text style={{ fontFamily: fonts.sansSemiBold }}>{preset.name}</Text>
          <Text style={{ fontSize: 0.75 * REM, color: colors.foregroundMuted }}>{`  ${label}`}</Text>
        </>
      ) : (
        label
      )}
    </Text>
  );
}

export default function QuickMarkSettings() {
  const { colors } = useTheme();
  const inputStyle = useInputStyle();
  const [prefs, setPrefs] = useReaderPreferences();
  // An account's quick marks are shown and edited only once its own list has been read: until then the list here is
  // the defaults, and an edit would replace the account's.
  const ready = useReaderPreferencesReady();
  const place = usePreferencesPlace();
  const presets = prefs.markPresets;
  const [adding, setAdding] = useState<MarkPreset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addCandidate = adding && !has(presets, adding) ? adding : firstUnused(presets);
  const isDefault = samePresets(presets, DEFAULT_MARK_PRESETS);
  // Custom colors already in the list, offered to every picker so one color can mark both ways.
  const customColors = customMarkColors(presets.map((preset) => preset.color));

  /** Saves the whole list. A write the device refuses leaves the list as it was and says so. */
  const change = (next: MarkPreset[]): boolean => {
    if (samePresets(presets, next)) return true;
    try {
      const saved = setPrefs({ ...prefs, markPresets: next });
      setError(saved ? null : ACCOUNT_SETTINGS_LOADING);
      return saved;
    } catch {
      setError("Couldn't save your quick marks on this device. Try again.");
      return false;
    }
  };

  const edit = (index: number, style: MarkStyle) => {
    const duplicate = presets.findIndex((item, at) => at !== index && sameMarkPreset(item, style));
    if (duplicate >= 0) {
      setError(`${markPresetLabel(style)} is already quick mark ${duplicate + 1}.`);
      return;
    }
    change(presets.map((item, at) => (at === index ? normalizeMarkPreset({ ...item, ...style }) : item)));
  };
  const rename = (index: number, name: string | undefined) => {
    change(presets.map((item, at) => (at === index ? normalizeMarkPreset({ kind: item.kind, color: item.color, name }) : item)));
  };
  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= presets.length) return;
    const next = [...presets];
    [next[index], next[to]] = [next[to], next[index]];
    change(next);
  };
  const add = () => {
    if (!addCandidate || presets.length >= MARK_PRESETS_MAX || has(presets, addCandidate)) return;
    if (change([...presets, normalizeMarkPreset(addCandidate)])) setAdding(null);
  };

  const help = { fontFamily: fonts.sans, fontSize: 0.76 * REM, lineHeight: 0.76 * REM * 1.5, color: colors.foregroundMuted } as const;
  if (!ready) {
    return (
      <View style={{ gap: 0.5 * REM, paddingVertical: 0.5 * REM }}>
        <CardHeader title="Quick marks" meta={place} metaLive action={<TextButton label="Restore defaults" testID="quick-marks-restore" disabled onPress={() => {}} />} />
        <Text testID="quick-marks-loading" accessibilityLiveRegion="polite" style={help}>
          {`${ACCOUNT_SETTINGS_LOADING} Your quick marks can be changed once they arrive.`}
        </Text>
      </View>
    );
  }

  const summary = presets.length === 0 ? `None · Annotate still has every option · ${place}` : `${presets.length} of ${MARK_PRESETS_MAX} · ${place}`;
  const row = { gap: 0.35 * REM, minHeight: 44, paddingTop: 0.3 * REM, paddingRight: 0.3 * REM, paddingBottom: 0.45 * REM, paddingLeft: 0.5 * REM, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: 0.6 * REM } as const;

  return (
    <View style={{ gap: 0.5 * REM, paddingVertical: 0.5 * REM }}>
      <CardHeader
        title="Quick marks"
        meta={summary}
        metaLive
        action={
          <TextButton
            label="Restore defaults"
            testID="quick-marks-restore"
            disabled={isDefault}
            onPress={() => {
              if (!isDefault) change(DEFAULT_MARK_PRESETS.map((preset) => ({ ...preset })));
            }}
          />
        }
      />
      <Text style={help}>Buttons at the top of the menu when you select verses, in this order. Each highlights or underlines the selected words in its color.</Text>
      <Text style={help}>{`A name (Blessings, Commandments…) is optional, up to ${MARK_PRESET_NAME_MAX} characters, and shows on its button.`}</Text>
      {presets.length > 0 ? (
        <View accessibilityLabel="Quick marks" style={{ gap: 0.25 * REM }}>
          {presets.map((preset, index) => {
            const phrase = markPresetPhrase(preset);
            const position = `Quick mark ${index + 1}`;
            return (
              <View key={`${index}:${preset.kind}:${preset.color}`} testID={`quick-mark-${index}`} style={row}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <MarkSample preset={preset} size={14} />
                  <PresetName preset={preset} />
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <SmallIconButton icon="arrow-up" label={`Move ${phrase} up`} disabled={index === 0} onPress={() => move(index, -1)} />
                    <SmallIconButton icon="arrow-down" label={`Move ${phrase} down`} disabled={index === presets.length - 1} onPress={() => move(index, 1)} />
                    <SmallIconButton icon="xmark" label={`Remove ${phrase}`} onPress={() => change(presets.filter((_, at) => at !== index))} />
                  </View>
                </View>
                <PresetNameField name={preset.name} label={`${position} name`} onCommit={(name) => rename(index, name)} />
                <MarkStylePicker value={preset} label={position} customColors={customColors} onChange={(style) => edit(index, style)} />
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={help}>No quick marks: the menu shows just its actions.</Text>
      )}
      {addCandidate && presets.length < MARK_PRESETS_MAX ? (
        <View accessibilityLabel="Add a quick mark" style={[row, { borderStyle: "dashed" }]}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <MarkSample preset={addCandidate} size={14} />
            <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 0.85 * REM, color: colors.foreground }}>New quick mark</Text>
            <TextButton icon="plus" label={`Add ${markPresetPhrase(normalizeMarkPreset(addCandidate))}`} testID="quick-mark-add" onPress={add} />
          </View>
          <View style={{ flexDirection: "row", maxWidth: 16 * REM }}>
            <TextInput
              accessibilityLabel="New quick mark name"
              placeholder="Name (optional)"
              placeholderTextColor={colors.foregroundMuted}
              maxLength={MARK_PRESET_NAME_MAX}
              returnKeyType="done"
              value={addCandidate.name ?? ""}
              onChangeText={(text) => setAdding({ ...addCandidate, name: text })}
              onSubmitEditing={add}
              style={inputStyle}
            />
          </View>
          <MarkStylePicker value={addCandidate} label="New quick mark" customColors={customColors} onChange={(style) => setAdding({ ...addCandidate, ...style })} />
        </View>
      ) : (
        <Text style={help}>Every highlight and underline color is a quick mark.</Text>
      )}
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[help, { color: colors.accentRubric }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
