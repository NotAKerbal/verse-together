// Reader settings (ReaderSettings.tsx): simple mode, kept on this device, then text size, typeface and text width,
// saved for whoever's study is shown (preferences.ts). Signed in, those wait for the account's own copy: until it has
// been read on this device they are disabled and say so, as the web's settings wait for the account's.

import { useRef } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import Sheet from "../../components/Sheet";
import { Button, Segmented, Txt } from "../../components/ui";
import {
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  useReaderPreferences,
  useReaderPreferencesReady,
  useSimpleMode,
  type ReaderTextWidth,
} from "../../storage/preferences";
import { ACCOUNT_SETTINGS_LOADING } from "../settings/preferencesPlace";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";

const STEP = 0.05;

export function ReaderSettingsFields() {
  const { colors } = useTheme();
  const [prefs, setPrefs] = useReaderPreferences();
  const ready = useReaderPreferencesReady();
  const [simple, setSimple] = useSimpleMode();
  const trackWidth = useRef(0);
  const pct = ((prefs.fontScale - MIN_FONT_SCALE) / (MAX_FONT_SCALE - MIN_FONT_SCALE)) * 100;
  const setScale = (value: number) =>
    ready &&
    setPrefs({ ...prefs, fontScale: Math.round(Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value)) * 100) / 100 });
  const label = { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.foregroundMuted } as const;
  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder }}>
        <View style={{ flex: 1 }}>
          <Text style={label}>Simple mode</Text>
          <Txt style={{ fontSize: 12, color: colors.foregroundSoft }}>Hide study tools and navigation. Just the text.</Txt>
        </View>
        <Switch
          accessibilityLabel="Simple mode"
          value={simple}
          onValueChange={setSimple}
          trackColor={{ true: colors.foreground, false: colors.surfaceBorder }}
          thumbColor={colors.background}
        />
      </View>
      {ready ? null : (
        <Text accessibilityRole="text" accessibilityLiveRegion="polite" testID="reader-settings-loading" style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundSoft }}>
          {ACCOUNT_SETTINGS_LOADING}
        </Text>
      )}
      <View
        testID="reader-settings-appearance"
        pointerEvents={ready ? "auto" : "none"}
        accessibilityState={{ disabled: !ready }}
        style={{ gap: 18, opacity: ready ? 1 : 0.5 }}
      >
        <View style={{ gap: 8 }}>
          <Text style={label}>{`Text size - ${Math.round(prefs.fontScale * 100)}%`}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Button label="A−" variant="secondary" accessibilityLabel="Smaller text" disabled={!ready || prefs.fontScale <= MIN_FONT_SCALE} onPress={() => setScale(prefs.fontScale - STEP)} />
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel="Text size"
              accessibilityState={{ disabled: !ready }}
              disabled={!ready}
              accessibilityValue={{ min: 85, max: 130, now: Math.round(prefs.fontScale * 100), text: `${Math.round(prefs.fontScale * 100)}%` }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(event) => setScale(prefs.fontScale + (event.nativeEvent.actionName === "increment" ? STEP : -STEP))}
              onLayout={(event) => {
                trackWidth.current = event.nativeEvent.layout.width;
              }}
              onPress={(event) => {
                const width = trackWidth.current;
                if (width > 0) setScale(MIN_FONT_SCALE + (event.nativeEvent.locationX / width) * (MAX_FONT_SCALE - MIN_FONT_SCALE));
              }}
              style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.surfaceCardSoft, overflow: "hidden" }}
            >
              <View style={{ width: `${pct}%`, height: "100%", backgroundColor: colors.foreground, borderRadius: 8 }} />
            </Pressable>
            <Button label="A+" variant="secondary" accessibilityLabel="Larger text" disabled={!ready || prefs.fontScale >= MAX_FONT_SCALE} onPress={() => setScale(prefs.fontScale + STEP)} />
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={label}>Typeface</Text>
          <Segmented
            label="Typeface"
            value={prefs.fontFamily}
            onChange={(fontFamily) => ready && setPrefs({ ...prefs, fontFamily })}
            options={[
              { value: "serif", label: "Serif" },
              { value: "sans", label: "Sans" },
            ]}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={label}>Text width</Text>
          <Segmented<ReaderTextWidth>
            label="Text width"
            value={prefs.textWidth}
            onChange={(textWidth) => ready && setPrefs({ ...prefs, textWidth })}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "wide", label: "Wide" },
              { value: "full", label: "Full" },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

export default function ReaderSettingsSheet({ visible, onClose, onMore }: { visible: boolean; onClose: () => void; onMore?: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Reader settings" testID="reader-settings">
      <ReaderSettingsFields />
      {onMore ? <Button variant="secondary" icon="sliders" label="Quick marks and more settings" onPress={onMore} /> : null}
    </Sheet>
  );
}
