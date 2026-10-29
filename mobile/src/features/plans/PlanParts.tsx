// Pieces the plans screens share (the web's PlansSignedOut.tsx, ProgressBar.tsx and the page headers): the back pill,
// the signed-out card, account notices, the progress bar, chips and the step heading.

import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useAccount } from "../../account/AccountProvider";
import { Button, Card, Eyebrow, Icon, IconButton, Notice, PillBar, Serif, Txt } from "../../components/ui";
import { useTheme } from "../../theme/theme";
import { fonts, radii } from "../../theme/tokens";
import type { PlansAccess } from "./planData";

/** Back to where the plans were opened from (or `fallback` when opened directly). */
export function PlansHeader({ title, fallback }: { title: string; fallback: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <PillBar style={{ paddingLeft: 6 }}>
      <IconButton icon="chevron-left" label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as never))} />
      <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, paddingHorizontal: 4, fontFamily: fonts.serif, fontSize: 18, lineHeight: 22, color: colors.foreground }}>
        {title}
      </Text>
      <IconButton icon="gear" label="Settings and account" onPress={() => router.push("/settings")} />
    </PillBar>
  );
}

export function PageHero({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: string; subtitle?: string; children?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8, paddingHorizontal: 4 }}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Serif accessibilityRole="header" style={{ fontSize: 30, lineHeight: 36 }}>
        {title}
      </Serif>
      {subtitle ? <Txt style={{ fontSize: 14, lineHeight: 21, color: colors.foregroundMuted }}>{subtitle}</Txt> : null}
      {children}
    </View>
  );
}

/** The web's "Sign in to keep a plan", with this app's Google sign-in. */
export function PlansSignedOut({ available }: { available: boolean }) {
  const { colors } = useTheme();
  const { signIn, signingIn, notice } = useAccount();
  return (
    <Card style={{ padding: 20, gap: 10, backgroundColor: colors.accentSkySoft }}>
      <Serif accessibilityRole="header" style={{ fontSize: 21, lineHeight: 26 }}>
        Sign in to keep a plan
      </Serif>
      <Txt style={{ fontSize: 14, lineHeight: 21, color: colors.foregroundMuted }}>
        Plans, read chapters, and your last reading spot are saved to your account so they follow you between devices.
      </Txt>
      {available ? (
        <Button
          icon="right-to-bracket"
          label={signingIn ? "Signing in…" : "Sign in"}
          busy={signingIn}
          disabled={signingIn}
          style={{ alignSelf: "flex-start" }}
          onPress={() => void signIn()}
        />
      ) : (
        <Txt style={{ fontSize: 13, lineHeight: 20, color: colors.foregroundMuted }}>Signing in isn’t set up in this build of the app.</Txt>
      )}
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
    </Card>
  );
}

export function LoadingCard({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Card soft style={{ paddingVertical: 22, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <ActivityIndicator color={colors.accentRubric} />
      <Txt accessibilityRole="progressbar" style={{ fontSize: 14, color: colors.foregroundMuted }}>
        {text}
      </Txt>
    </Card>
  );
}

/**
 * What the plans screens show instead of plans when the account can't be used right now, or null when it can.
 * `offline` with nothing loaded yet says so rather than loading forever.
 */
export function PlansAccessNotice({ access }: { access: PlansAccess }) {
  const router = useRouter();
  const { retry } = useAccount();
  if (access.kind === "signed-out") return <PlansSignedOut available={access.available} />;
  if (access.kind === "checking") return <LoadingCard text="Checking your account…" />;
  if (access.kind === "unreachable") {
    const text =
      access.status === "offline"
        ? "Verse Together can’t be reached right now, so your plans can’t be loaded. Your plans are safe in your account."
        : access.status === "deletion-pending"
          ? "Deleting your account didn’t finish. Finish deleting it, or sign out, in Settings."
          : "Your account couldn’t be checked. Try again, or sign out and sign in again in Settings.";
    return (
      <View style={{ gap: 10 }}>
        <Notice tone="warning">{text}</Notice>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {access.status !== "deletion-pending" ? <Button variant="secondary" icon="rotate" label="Try again" onPress={retry} /> : null}
          <Button variant="secondary" icon="gear" label="Account settings" onPress={() => router.push("/settings")} />
        </View>
      </View>
    );
  }
  if (!access.calls) return <LoadingCard text="Connecting to your account…" />;
  return null;
}

/** Shown while a followed list or plan hasn't answered: offline says so, a failed read offers nothing it can't do. */
export function NotLoaded({ online, failed, loading }: { online: boolean; failed: boolean; loading: string }) {
  if (!online) return <Notice tone="warning">You’re offline. Your plans show once you’re connected again.</Notice>;
  if (failed) return <Notice tone="warning">Your plans couldn’t be loaded right now. Check your connection; they load again on their own.</Notice>;
  return <LoadingCard text={loading} />;
}

/** The web's ProgressBar: a pill track filled to value/max. */
export function ProgressBar({ value, max, label, style }: { value: number; max: number; label: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const percent = max > 0 ? Math.round((Math.min(value, max) / max) * 100) : 0;
  return (
    <View style={[{ gap: 4 }, style]}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max, now: Math.min(value, max) }}
        style={{ height: 10, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surfaceCard, overflow: "hidden" }}
      >
        <View style={{ width: `${percent}%`, height: "100%", backgroundColor: percent === 100 ? colors.readerRead : colors.accentGoal }} />
      </View>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.foregroundMuted }}>{label}</Text>
    </View>
  );
}

export function Tag({ children, background }: { children: ReactNode; background?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: background ?? colors.surfaceCardSoft }}>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.foreground }}>{children}</Text>
    </View>
  );
}

/** A toggle chip (the web's builder chips): `on` tints it and adds a check. */
export function Chip({
  label,
  meta,
  on,
  background,
  disabled,
  onPress,
  accessibilityLabel,
  expanded,
}: {
  label: string;
  meta?: string;
  on: boolean;
  background?: string;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  expanded?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (meta ? `${label}, ${meta}` : label)}
      accessibilityState={{ selected: on, disabled: !!disabled, expanded }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 40,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.surfaceBorder,
        backgroundColor: background ?? (on ? colors.accentMint : pressed ? colors.surfaceButtonHover : colors.surfaceCard),
        opacity: disabled ? 0.7 : 1,
      })}
    >
      {on ? <Icon name="check" size={11} /> : null}
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.foreground }}>{label}</Text>
      {meta ? <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.foregroundMuted }}>{meta}</Text> : null}
    </Pressable>
  );
}

export function StepHeading({ number, title, hint }: { number: number; title: string; hint: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentPrimary }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#17161a" }}>{number}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Serif accessibilityRole="header" style={{ fontSize: 20, lineHeight: 25 }}>
          {title}
        </Serif>
        <Txt style={{ fontSize: 13.5, lineHeight: 20, color: colors.foregroundMuted }}>{hint}</Txt>
      </View>
    </View>
  );
}

export function SubLabel({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase", color: colors.foregroundSoft }}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Notice tone="warning">{children}</Notice>
    </View>
  );
}
