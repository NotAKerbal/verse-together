// The Settings sections (src/features/settings/settingsTabs.ts and src/app/account/page.tsx): a pill of tabs, one
// section open at a time, the open one dark with its name and the others as icons. The web's sections, with About
// (this app's version, the website's release notes, support, privacy and account deletion) in place of Release
// notes: the website's versions aren't the app's.

import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Icon, softShadow, type IconName } from "../../components/ui";
import { useTheme } from "../../theme/theme";
import { fonts, REM } from "../../theme/tokens";

export const SETTINGS_TABS = ["account", "reading", "bible-translations", "study-tools", "feedback", "about"] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTINGS_TAB: SettingsTabId = "account";

export const TABS: Record<SettingsTabId, { label: string; icon: IconName; title: string; lead: string }> = {
  account: {
    label: "Account",
    icon: "user",
    title: "Account",
    lead: "Your Google sign-in, and the study saved on this device.",
  },
  reading: {
    label: "Reading",
    icon: "book-open",
    title: "Reading & appearance",
    lead: "How scripture chapters look in the reader. The reader's settings menu has the same choices.",
  },
  "bible-translations": {
    label: "Translations",
    icon: "book-bible",
    title: "Bible translations",
    lead: "Choose your default Bible and manage saved translations. Saved on this device; also available in Reader settings.",
  },
  "study-tools": {
    label: "Study tools",
    icon: "highlighter",
    title: "Study tools",
    lead: "The marks at the top of the selection menu when you choose verses.",
  },
  feedback: {
    label: "Feedback",
    icon: "comment-dots",
    title: "Feedback",
    lead: "Ideas, problems, or requests for Verse Together. Every message is read.",
  },
  about: {
    label: "About",
    icon: "circle-info",
    title: "About",
    lead: "This app's version, the website's release notes, help, privacy and your data.",
  },
};

/** "reading" opens Reading; anything else (or nothing) opens Account, as the web's hash does. */
export function tabFromParam(value: unknown): SettingsTabId {
  const id = Array.isArray(value) ? value[0] : value;
  return typeof id === "string" && (SETTINGS_TABS as readonly string[]).includes(id) ? (id as SettingsTabId) : DEFAULT_SETTINGS_TAB;
}

/** The sections' tabs (.tabList[data-placement="page"]): never wider than 30rem, the open tab growing to its name. */
export function SettingsTabs({ selected, onSelect }: { selected: SettingsTabId; onSelect: (tab: SettingsTabId) => void }) {
  const { colors, scheme } = useTheme();
  const { width } = useWindowDimensions();
  // Narrow phones: the tabs sit closer and the open one shows only its name, so six fit with the longest name open.
  const narrow = width < 400;
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Settings"
      style={[
        {
          flexDirection: "row",
          gap: narrow ? 2 : 4,
          width: "100%",
          maxWidth: 30 * REM,
          padding: 5,
          borderWidth: 1,
          borderColor: colors.surfaceBorder,
          borderRadius: 999,
          backgroundColor: colors.surfaceCard,
        },
        softShadow(colors, scheme),
      ]}
    >
      {SETTINGS_TABS.map((tab) => {
        const isSelected = tab === selected;
        const { label, icon } = TABS[tab];
        const color = isSelected ? colors.surfaceButtonActiveText : colors.foreground;
        return (
          <Pressable
            key={tab}
            testID={`settings-tab-${tab}`}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(tab)}
            style={({ pressed }) => ({
              flexGrow: isSelected ? 3 : 1,
              flexShrink: isSelected ? 0 : 1,
              flexBasis: isSelected ? "auto" : 0,
              minWidth: width < 340 ? 36 : narrow ? 40 : 44,
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingHorizontal: narrow ? 8 : 0.6 * REM,
              borderRadius: 999,
              backgroundColor: isSelected ? colors.surfaceButtonActive : pressed ? colors.surfaceButtonHover : "transparent",
            })}
          >
            {isSelected && narrow ? null : <Icon name={icon} size={0.95 * REM} color={color} />}
            {isSelected ? (
              <Text numberOfLines={1} style={{ flexShrink: 0, fontFamily: fonts.sansMedium, fontSize: 0.8 * REM, color }}>
                {label}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A section's heading and the line under it (.panelHeader). */
export function PanelHeader({ tab }: { tab: SettingsTabId }) {
  const { colors } = useTheme();
  const { title, lead } = TABS[tab];
  return (
    <View style={{ gap: 0.2 * REM }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 1.35 * REM, lineHeight: 1.35 * REM * 1.2, letterSpacing: -0.012 * 1.35 * REM, color: colors.foreground }}>
        {title}
      </Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 0.8 * REM, lineHeight: 0.8 * REM * 1.5, color: colors.foregroundMuted }}>{lead}</Text>
    </View>
  );
}
