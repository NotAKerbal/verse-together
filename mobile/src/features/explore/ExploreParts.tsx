// Explore's native building blocks (the web's ExploreSection.tsx and WordStudyLinks.tsx): softly tinted section cards
// in the web's sage, blue and clay tones (globals.css .explore-card, light and dark), each opening to plain result
// rows, and each row to its full content; the loading and retry states every source shows; and links out.

import { createContext, useContext, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { SourceStatus } from "@/lib/exploreSources";
import { openExternal } from "../../components/Blocks";
import { Icon } from "../../components/ui";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";

export type Tone = "sage" | "blue" | "clay";
export type TonePalette = { tint: string; edge: string; accent: string; accentSoft: string; onAccent: string; pill: string; rowPressed: string };

const TONES: Record<"light" | "dark", Record<Tone, TonePalette>> = {
  light: {
    sage: { tint: "#e7ecdf", edge: "#cbd6be", accent: "#435e3a", accentSoft: "#d2dec6", onAccent: "#ffffff", pill: "rgba(255, 255, 255, 0.6)", rowPressed: "rgba(255, 255, 255, 0.5)" },
    blue: { tint: "#e3e9f0", edge: "#c5d1de", accent: "#33547a", accentSoft: "#cad7e5", onAccent: "#ffffff", pill: "rgba(255, 255, 255, 0.6)", rowPressed: "rgba(255, 255, 255, 0.5)" },
    clay: { tint: "#f3e5d7", edge: "#e0c6ad", accent: "#8a4a1e", accentSoft: "#e9cfb7", onAccent: "#ffffff", pill: "rgba(255, 255, 255, 0.6)", rowPressed: "rgba(255, 255, 255, 0.5)" },
  },
  dark: {
    sage: { tint: "#20261e", edge: "#354131", accent: "#a9c59b", accentSoft: "#2e3a2a", onAccent: "#181715", pill: "rgba(0, 0, 0, 0.22)", rowPressed: "rgba(255, 255, 255, 0.05)" },
    blue: { tint: "#1d232b", edge: "#333e4c", accent: "#a3bede", accentSoft: "#2a3542", onAccent: "#181715", pill: "rgba(0, 0, 0, 0.22)", rowPressed: "rgba(255, 255, 255, 0.05)" },
    clay: { tint: "#2a211a", edge: "#4a392b", accent: "#e5ae80", accentSoft: "#3d2e22", onAccent: "#181715", pill: "rgba(0, 0, 0, 0.22)", rowPressed: "rgba(255, 255, 255, 0.05)" },
  },
};

const ToneContext = createContext<TonePalette>(TONES.light.sage);

/** The open section's palette, for its rows and actions. */
export function useTone(): TonePalette {
  return useContext(ToneContext);
}

/** An entry put in a new journal entry ("Add to note"). */
export type NoteCard = { word: string; meta: string | null; text: string; source: string };

/** Where Explore's links and actions go: an app path (closing Explore), and a new journal entry. */
export type ExploreLinks = { onPath: (path: string) => void; onAddToNote: (card: NoteCard) => void };
export const ExploreLinksContext = createContext<ExploreLinks>({ onPath: () => {}, onAddToNote: () => {} });

export type ExploreDisclosure = { open: boolean; openRow: string | null; onToggle: () => void; onToggleRow: (row: string) => void };

type Rows = { openRow: string | null; onToggleRow: (row: string) => void };
const RowsContext = createContext<Rows>({ openRow: null, onToggleRow: () => {} });

function HeaderStatus({ status, count, palette }: { status: SourceStatus; count: { value: number; unit: string } | null; palette: TonePalette }) {
  const { colors } = useTheme();
  if (count) {
    return (
      <View style={{ borderRadius: 999, backgroundColor: palette.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: palette.accent }}>{`${count.value} ${count.unit}`}</Text>
      </View>
    );
  }
  if (status === "loading") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <ActivityIndicator size="small" color={palette.accent} />
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundMuted }}>Loading</Text>
      </View>
    );
  }
  if (status === "error") return <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.accentRubric }}>Didn’t load</Text>;
  return null;
}

/** One of Explore's sections: a header that opens it, and its rows, rendered only while it is open. */
export function ExploreSection({
  tone,
  icon,
  title,
  summary,
  status,
  count,
  disclosure,
  testID,
  children,
}: {
  tone: Tone;
  icon: ReactNode;
  title: string;
  summary: string;
  status: SourceStatus;
  /** What it found, once it has; otherwise the header shows that it is loading or failed. */
  count: { value: number; unit: string } | null;
  disclosure: ExploreDisclosure;
  testID?: string;
  children: ReactNode;
}) {
  const { colors, scheme } = useTheme();
  const palette = TONES[scheme][tone];
  const { open, openRow, onToggle, onToggleRow } = disclosure;
  const statusWords = count ? `${count.value} ${count.unit}` : status === "loading" ? "loading" : status === "error" ? "didn’t load" : "";
  return (
    <ToneContext.Provider value={palette}>
      <View
        testID={testID}
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: open ? palette.accent : palette.edge,
          backgroundColor: palette.tint,
          boxShadow: open && scheme === "light" ? "0 4px 16px rgba(31, 29, 26, 0.08)" : undefined,
        }}
      >
        <Pressable
          testID={testID ? `${testID}-toggle` : undefined}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={[title, summary, statusWords].filter(Boolean).join(", ")}
          onPress={onToggle}
          style={({ pressed }) => ({ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 13, backgroundColor: pressed ? palette.rowPressed : "transparent" })}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: palette.accentSoft }}>{icon}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: fonts.serif, fontSize: 18, lineHeight: 22, color: colors.foreground }}>{title}</Text>
            <Text style={{ marginTop: 2, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.foregroundMuted }}>{summary}</Text>
          </View>
          <HeaderStatus status={status} count={count} palette={palette} />
          <Icon name={open ? "chevron-up" : "chevron-down"} size={13} color={palette.accent} />
        </Pressable>
        {open ? (
          <View style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
            <RowsContext.Provider value={{ openRow, onToggleRow }}>{children}</RowsContext.Provider>
          </View>
        ) : null}
      </View>
    </ToneContext.Provider>
  );
}

/** The two-letter mark of a section with no picture of its own. */
export function GlyphText({ children }: { children: string }) {
  const palette = useTone();
  return <Text style={{ fontFamily: fonts.serif, fontSize: 15, fontWeight: "600", color: palette.accent }}>{children}</Text>;
}

/** A section's loading or retry message, set in from the card's edge like its rows. */
export function ExploreNotice({ children }: { children: ReactNode }) {
  return <View style={{ paddingHorizontal: 10, paddingVertical: 8 }}>{children}</View>;
}

/** A result's title row; opening it shows the result in full and closes any other open result in the section. */
export function ExploreRow({ id, label, title, children, testID }: { id: string; label: ReactNode; title: ReactNode; children: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const palette = useTone();
  const { openRow, onToggleRow } = useContext(RowsContext);
  const open = openRow === id;
  return (
    <View>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => onToggleRow(id)}
        style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: pressed ? palette.rowPressed : "transparent" })}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.foregroundMuted }}>{label}</Text>
          <Text style={{ marginTop: 1, fontFamily: fonts.serif, fontSize: 16, lineHeight: 21, color: open ? palette.accent : colors.foreground }}>{title}</Text>
        </View>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={12} color={palette.accent} />
      </Pressable>
      {open ? <View style={{ paddingHorizontal: 10, paddingTop: 2, paddingBottom: 12, gap: 8 }}>{children}</View> : null}
    </View>
  );
}

export function Eyebrow({ children, nativeID }: { children: ReactNode; nativeID?: string }) {
  const { colors } = useTheme();
  return (
    <Text nativeID={nativeID} style={{ fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.foregroundMuted }}>
      {children}
    </Text>
  );
}

export function LoadingLines({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite" style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <ActivityIndicator size="small" color={colors.accentRubric} />
        <Text style={{ flexShrink: 1, fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundMuted }}>{label}</Text>
      </View>
      <View style={{ gap: 6 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={{ height: 10, width: "100%", borderRadius: 4, backgroundColor: colors.surfaceCardSoft }} />
        <View style={{ height: 10, width: "80%", borderRadius: 4, backgroundColor: colors.surfaceCardSoft }} />
      </View>
    </View>
  );
}

/** A quiet bordered pill (the web's quietButton). */
export function QuietButton({ label, onPress, accessibilityLabel, expanded, testID }: { label: string; onPress: () => void; accessibilityLabel?: string; expanded?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 40, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: pressed ? colors.surfaceButtonHover : colors.surfaceButton })}
    >
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.foreground }}>{label}</Text>
    </Pressable>
  );
}

export function LoadError({ message, onRetry, children, retryLabel = "Try again" }: { message: string; onRetry: () => void; children?: ReactNode; retryLabel?: string }) {
  const { colors } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 19, color: colors.foregroundMuted }}>{message}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 4 }}>
        <QuietButton label="Try again" accessibilityLabel={retryLabel} onPress={onRetry} />
        {children}
      </View>
    </View>
  );
}

/** A link out to the source, opened in the browser. */
export function ExternalLink({ url, label, a11y, testID }: { url: string; label: string; a11y?: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={a11y ?? label}
      accessibilityHint="Opens in the browser"
      onPress={() => void openExternal(url)}
      style={({ pressed }) => ({ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.foregroundMuted, textDecorationLine: "underline", textDecorationColor: colors.surfaceBorder }}>{label}</Text>
      <Icon name="arrow-up-right-from-square" size={10} color={colors.foregroundSoft} />
    </Pressable>
  );
}

/** A result's main action inside an Explore section, in the section's accent (the web's exploreAction). */
export function ExploreAction({ label, onPress, hint, testID }: { label: string; onPress: () => void; hint?: string; testID?: string }) {
  const palette = useTone();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 40, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 })}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: palette.onAccent }}>{label}</Text>
    </Pressable>
  );
}
