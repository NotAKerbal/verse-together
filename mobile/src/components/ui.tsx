// Native counterparts of the web's shared surfaces in globals.css: panel cards, the floating pill chrome,
// rubric eyebrows, serif titles, pill buttons, and the page shell with room for the floating navigation.

import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { type ComponentProps, type ComponentRef, type ReactNode, type Ref } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/theme";
import { fonts, radii, REM, type ThemeColors } from "../theme/tokens";

export type IconName = ComponentProps<typeof FontAwesome6>["name"];

export function Icon({ name, size = 16, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <FontAwesome6 name={name} size={size} color={color ?? colors.foreground} style={style} solid accessible={false} importantForAccessibility="no" />;
}

/** --surface-shadow-soft and --surface-shadow-lift. */
export function softShadow(colors: ThemeColors, scheme: "light" | "dark"): ViewStyle {
  return {
    boxShadow:
      scheme === "dark"
        ? "0 1px 2px rgba(0, 0, 0, 0.3), 0 12px 26px -18px rgba(0, 0, 0, 0.8)"
        : "0 1px 2px rgba(31, 29, 26, 0.05), 0 10px 24px -18px rgba(31, 29, 26, 0.35)",
  };
}

export function liftShadow(scheme: "light" | "dark"): ViewStyle {
  return {
    boxShadow:
      scheme === "dark"
        ? "0 1px 2px rgba(0, 0, 0, 0.35), 0 16px 30px -18px rgba(0, 0, 0, 0.85)"
        : "0 1px 2px rgba(31, 29, 26, 0.06), 0 14px 30px -18px rgba(31, 29, 26, 0.4)",
  };
}

/** "#f6f3ec" → "rgba(246, 243, 236, a)". */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const n = parseInt(value.length === 3 ? value.replace(/(.)/g, "$1$1") : value, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ---- Type ----

type TxtProps = TextProps & { style?: StyleProp<TextStyle> };

/** DM Sans body text in the foreground color. */
export function Txt({ style, ...props }: TxtProps) {
  const { colors } = useTheme();
  return <Text {...props} style={[{ fontFamily: fonts.sans, color: colors.foreground, fontSize: 15 }, style]} />;
}

/** The book serif (titles and scripture); weight 400 like the web's display type. */
export function Serif({ style, ...props }: TxtProps) {
  const { colors } = useTheme();
  return <Text {...props} style={[{ fontFamily: fonts.serif, color: colors.foreground, fontWeight: "400" }, style]} />;
}

/** .page-eyebrow: small uppercase rubric kicker. */
export function Eyebrow({ style, tone = "rubric", ...props }: TxtProps & { tone?: "rubric" | "soft" | "muted" }) {
  const { colors } = useTheme();
  const color = tone === "rubric" ? colors.accentRubric : tone === "soft" ? colors.foregroundSoft : colors.foregroundMuted;
  return (
    <Text
      {...props}
      style={[{ fontFamily: fonts.sansSemiBold, fontSize: 0.72 * REM, letterSpacing: 0.14 * 0.72 * REM, textTransform: "uppercase", color }, style]}
    />
  );
}

/** .section heading: serif, ~1.5rem on phones. */
export function SectionHeading({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Serif accessibilityRole="header" style={[{ fontSize: 1.45 * REM, lineHeight: 1.45 * REM * 1.2, paddingHorizontal: 4 }, style]}>
      {children}
    </Serif>
  );
}

// ---- Surfaces ----

export function Card({ style, children, soft = false }: { style?: StyleProp<ViewStyle>; children?: ReactNode; soft?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.lg, backgroundColor: soft ? colors.surfaceCardSoft : colors.surfaceCard },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type PressCardProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  background?: string;
  ref?: Ref<ComponentRef<typeof View>>;
};

/** .panel-card.interactive-card: a whole-card link that darkens while pressed. */
export function PressCard({ style, children, background, ref, ...props }: PressCardProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      ref={ref}
      accessibilityRole="link"
      {...props}
      style={({ pressed }) => [
        {
          borderWidth: 1,
          borderColor: pressed ? colors.ruleStrong : colors.surfaceBorder,
          borderRadius: radii.lg,
          backgroundColor: pressed ? colors.surfaceButtonHover : background ?? colors.surfaceCard,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** The round bordered chevron at a card's corner. */
export function ChevronCircle({ size = 32 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: colors.surfaceBorder,
        backgroundColor: colors.surfaceCard,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="chevron-right" size={12} />
    </View>
  );
}

/** The floating pill chrome (.desktop-nav-bar, .reader-toolbar, .app-header-selection). */
export function PillBar({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          minHeight: 56,
          paddingVertical: 5,
          paddingHorizontal: 6,
          borderWidth: 1,
          borderColor: colors.surfaceBorder,
          borderRadius: radii.pill,
          backgroundColor: colors.surfaceCard,
        },
        softShadow(colors, scheme),
        style,
      ]}
    >
      {children}
    </View>
  );
}

type IconButtonProps = Omit<PressableProps, "style" | "children"> & {
  icon: IconName;
  label: string;
  size?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  iconColor?: string;
};

/** A 44pt round control in the pill chrome (.reader-toolbar-button on phones). */
export function IconButton({ icon, label, size = 44, active = false, style, iconColor, ...props }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      {...props}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? colors.surfaceButtonActive : pressed ? colors.surfaceButtonHover : "transparent",
          opacity: props.disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} size={18} color={iconColor ?? (active ? colors.surfaceButtonActiveText : colors.foreground)} />
    </Pressable>
  );
}

type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  label: string;
  icon?: IconName;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  style?: StyleProp<ViewStyle>;
  busy?: boolean;
  trailing?: string;
};

/** .primaryAction (dark pill) and the quieter bordered pill buttons. 44pt minimum height. */
export function Button({ label, icon, variant = "primary", style, busy, trailing, ...props }: ButtonProps) {
  const { colors } = useTheme();
  const filled = variant === "primary";
  const fg = filled ? colors.surfaceButtonActiveText : variant === "danger" ? colors.accentRubric : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!props.disabled, busy: !!busy }}
      {...props}
      style={({ pressed }) => [
        {
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 19,
          borderRadius: radii.pill,
          borderWidth: variant === "quiet" ? 0 : 1,
          borderColor: filled ? colors.surfaceButtonActive : variant === "danger" ? colors.accentRubricLine : colors.surfaceBorder,
          backgroundColor: filled ? colors.surfaceButtonActive : pressed ? colors.surfaceButtonHover : variant === "quiet" ? "transparent" : colors.surfaceButton,
          opacity: props.disabled ? 0.5 : filled && pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: fg }}>{label}</Text>
      {trailing ? <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: fg }}>{trailing}</Text> : null}
    </Pressable>
  );
}

/** .segmented-control: a pill of mutually exclusive options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: "row", gap: 4, padding: 3, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.pill, backgroundColor: colors.surfaceCard }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 40,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 12,
              borderRadius: radii.pill,
              backgroundColor: active ? colors.surfaceButtonActive : pressed ? colors.surfaceButtonHover : "transparent",
            })}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: active ? colors.surfaceButtonActiveText : colors.foreground }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- Page shell ----

/** Room below page content for the floating bottom navigation (its 58pt pill and 0.85rem inset). */
export const BOTTOM_NAV_CLEARANCE = 88;

export function useBottomClearance(extra = 0): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 14) + BOTTOM_NAV_CLEARANCE + extra;
}

type PageProps = ScrollViewProps & { children: ReactNode; gap?: number; withNav?: boolean; ref?: Ref<ComponentRef<typeof ScrollView>> };

/** .page-shell: one scroll with the shell gutter, safe-area top inset, and room for the bottom navigation. */
export function Page({ children, gap = 24, withNav = true, contentContainerStyle, ref, ...props }: PageProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useBottomClearance();
  return (
    <ScrollView
      ref={ref}
      style={{ flex: 1, backgroundColor: colors.background }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      {...props}
      contentContainerStyle={[
        { paddingTop: Math.max(insets.top, 16) + 8, paddingHorizontal: 16, paddingBottom: withNav ? bottom : insets.bottom + 24, gap, width: "100%", maxWidth: 1180, alignSelf: "center" },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

export function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warning" }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole={tone === "warning" ? "alert" : undefined}
      style={{
        borderWidth: 1,
        borderColor: tone === "warning" ? "rgba(245, 158, 11, 0.45)" : colors.surfaceBorder,
        borderRadius: radii.lg,
        backgroundColor: colors.surfaceCard,
        paddingVertical: 10,
        paddingHorizontal: 14,
      }}
    >
      <Txt style={{ fontSize: 13, lineHeight: 19, color: colors.foregroundMuted }}>{children}</Txt>
    </View>
  );
}

export const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
