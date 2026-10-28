// The Settings page's shared pieces, from src/app/account/page.module.css: the section cards (.settingsCard with
// .preferences inside), a card's title row with its status line and an action on the right (.cardHeader), the
// rubric switch (.toggle), the small bordered text buttons (.quickMarkTextButton) and the quiet privacy link below
// every section (.policyLink).

import { type ReactNode } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon, softShadow, type IconName } from "../../components/ui";
import { useTheme } from "../../theme/theme";
import { fonts, REM } from "../../theme/tokens";

/** .settingsCard + .preferences: a soft card with no border, its content inset. */
export function SettingsCard({ children, style, label, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; label?: string; testID?: string }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityLabel={label}
      style={[{ borderRadius: 0.9 * REM, backgroundColor: colors.surfaceCard, padding: 0.5 * REM }, softShadow(colors, scheme), style]}
    >
      <View style={{ paddingVertical: 0.5 * REM, paddingHorizontal: 0.75 * REM }}>{children}</View>
    </View>
  );
}

/** .settingTitle: the h3 inside a card, in the display serif. */
export function SettingTitle({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 0.82 * REM, lineHeight: 20, letterSpacing: -0.012 * 0.82 * REM, color: colors.foreground }}>
      {children}
    </Text>
  );
}

/** The small muted line under a setting's title (.setting p, .cardHeader p). */
export function SettingMeta({ children, live = false }: { children: ReactNode; live?: boolean }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityLiveRegion={live ? "polite" : undefined} style={{ marginTop: 0.15 * REM, fontFamily: fonts.sans, fontSize: 0.7 * REM, lineHeight: 17, color: colors.foregroundMuted }}>
      {children}
    </Text>
  );
}

/** .cardHeader: title and status on the left, an action on the right. */
export function CardHeader({ title, meta, action, metaLive }: { title: string; meta?: ReactNode; action?: ReactNode; metaLive?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 0.75 * REM, paddingTop: 0.5 * REM, paddingBottom: 1 * REM }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <SettingTitle>{title}</SettingTitle>
        {meta ? <SettingMeta live={metaLive}>{meta}</SettingMeta> : null}
      </View>
      {action}
    </View>
  );
}

/** .quickMarkTextButton: a small bordered button (Reset, Restore defaults, Add…). Dimmed, not hidden, when it can't act. */
export function TextButton({
  label,
  icon,
  onPress,
  disabled = false,
  accessibilityLabel,
  testID,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 36,
        minWidth: 36,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: 0.6 * REM,
        borderRadius: 0.45 * REM,
        borderWidth: 1,
        borderColor: colors.surfaceBorder,
        backgroundColor: pressed && !disabled ? colors.surfaceCardSoft : "transparent",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={11} color={colors.foregroundMuted} /> : null}
      <Text style={{ fontFamily: fonts.sans, fontSize: 0.8 * REM, color: colors.foregroundMuted }}>{label}</Text>
    </Pressable>
  );
}

/** .quickMarkIconButton: a 36pt icon-only control (move up, move down, remove). */
export function SmallIconButton({ icon, label, onPress, disabled = false }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 0.45 * REM,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed && !disabled ? colors.surfaceCardSoft : "transparent",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Icon name={icon} size={14} color={colors.foregroundMuted} />
    </Pressable>
  );
}

/**
 * .toggle: a 48×44 switch. Off, a soft track with a muted knob at the start; on, a rubric track with a light knob
 * carrying a check at the end.
 */
export function SettingSwitch({ value, onChange, label, testID }: { value: boolean; onChange: (next: boolean) => void; label: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={4}
      style={{ width: 48, height: 44, paddingHorizontal: 3, justifyContent: "center" }}
    >
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 9,
          bottom: 9,
          borderRadius: 32,
          borderWidth: 1,
          borderColor: value ? colors.accentRubric : colors.ruleStrong,
          backgroundColor: value ? colors.accentRubric : colors.surfaceCardSoft,
        }}
      />
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: value ? colors.surfaceCard : colors.foregroundMuted,
          transform: [{ translateX: value ? 22 : 0 }],
        }}
      >
        {value ? <Icon name="check" size={10} color={colors.accentRubric} /> : null}
      </View>
    </Pressable>
  );
}

/** .setting: a title and its status on the left, a control on the right, 44pt tall at least. */
export function SettingRow({ title, meta, metaLive, children }: { title: string; meta?: ReactNode; metaLive?: boolean; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 0.75 * REM, minHeight: 44 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <SettingTitle>{title}</SettingTitle>
        {meta ? <SettingMeta live={metaLive}>{meta}</SettingMeta> : null}
      </View>
      {children}
    </View>
  );
}

/** A plain underlined link line (.policyLink): opens outside the app. */
export function QuietLink({ label, onPress, hint, testID }: { label: string; onPress: () => void; hint?: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Text
      testID={testID}
      accessibilityRole="link"
      accessibilityHint={hint}
      onPress={onPress}
      suppressHighlighting
      style={{
        alignSelf: "flex-start",
        minHeight: 44,
        paddingVertical: 12,
        fontFamily: fonts.sans,
        fontSize: 0.8 * REM,
        color: colors.foregroundSoft,
        textDecorationLine: "underline",
        textDecorationColor: colors.ruleStrong,
      }}
    >
      {label}
    </Text>
  );
}
