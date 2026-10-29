// Settings, as the website's phone Settings (src/app/account/page.tsx): a pill of sections at the top, one open at a
// time under its heading and lead, and a quiet privacy link below. Every section stays mounted while another is
// open, so a quick-mark name being typed is still there after visiting another. `/settings?tab=reading` opens a
// section directly; without it Account opens, as on the web.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountSection } from "../src/account/AccountSection";
import { openExternal } from "../src/components/Blocks";
import { Button, IconButton } from "../src/components/ui";
import AboutSettings, { PRIVACY_URL } from "../src/features/settings/AboutSettings";
import QuickMarkSettings from "../src/features/settings/QuickMarkSettings";
import ReadingSettings from "../src/features/settings/ReadingSettings";
import { CardHeader, QuietLink, SettingsCard } from "../src/features/settings/SettingsParts";
import { PanelHeader, SettingsTabs, TABS, tabFromParam, type SettingsTabId } from "../src/features/settings/settingsTabs";
import TranslationSettings from "../src/features/settings/TranslationSettings";
import { DEVICE_STUDY_KEY, EMPTY_DEVICE_STUDY } from "../src/shared/web";
import { storage } from "../src/storage/kv";
import { deviceStudy, useDeviceStudy } from "../src/storage/study";
import { useTheme } from "../src/theme/theme";
import { fonts, REM } from "../src/theme/tokens";

function Panel({ tab, selected, children }: { tab: SettingsTabId; selected: boolean; children: ReactNode }) {
  return (
    <View
      testID={`settings-panel-${tab}`}
      accessibilityLabel={TABS[tab].label}
      accessibilityElementsHidden={!selected}
      importantForAccessibility={selected ? "auto" : "no-hide-descendants"}
      style={{ display: selected ? "flex" : "none", gap: 0.9 * REM }}
    >
      <PanelHeader tab={tab} />
      {children}
    </View>
  );
}

/** The signed-out study kept in this app's storage: how much there is, and deleting all of it. */
function DeviceStudyCard() {
  const { colors } = useTheme();
  const study = useDeviceStudy();
  const notes = study.notes.filter((row) => row.owner === null).length;
  const annotations = study.annotations.filter((row) => row.owner === null).length;
  const clearDevice = () =>
    Alert.alert("Delete all study on this device?", `${notes} journal entries and ${annotations} verse notes and marks will be removed. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete everything",
        style: "destructive",
        onPress: () => {
          try {
            storage().setItem(DEVICE_STUDY_KEY, JSON.stringify(EMPTY_DEVICE_STUDY));
            deviceStudy.refresh();
          } catch (error) {
            Alert.alert("Couldn't delete", error instanceof Error ? error.message : "Storage refused the change.");
          }
        },
      },
    ]);
  return (
    <SettingsCard label="This device">
      <CardHeader
        title="This device"
        meta={`${notes} journal ${notes === 1 ? "entry" : "entries"} · ${annotations} verse ${annotations === 1 ? "annotation" : "annotations"}`}
      />
      <View style={{ gap: 10, paddingBottom: 6 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 0.8 * REM, lineHeight: 0.8 * REM * 1.55, color: colors.foregroundMuted }}>
          Study saved only in this app, on this phone. Deleting it doesn’t change your account.
        </Text>
        <Button variant="danger" icon="trash" label="Delete all study on this device" style={{ alignSelf: "flex-start" }} onPress={clearDevice} />
      </View>
    </SettingsCard>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [selected, setSelected] = useState<SettingsTabId>(() => tabFromParam(params.tab));
  const select = (tab: SettingsTabId) => {
    if (tab === selected) return;
    setSelected(tab);
    // A new section starts at its heading even when the previous one was long.
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 4, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text accessibilityRole="header" style={{ flex: 1, paddingLeft: 6, fontFamily: fonts.serif, fontSize: 24, color: colors.foreground }}>
          Settings
        </Text>
        <IconButton icon="xmark" label="Close settings" onPress={() => router.back()} />
      </View>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 0.5 * REM, paddingBottom: insets.bottom + 3 * REM, gap: 1.25 * REM, width: "100%", maxWidth: 64 * REM, alignSelf: "center" }}
      >
        <SettingsTabs selected={selected} onSelect={select} />
        <View>
          <Panel tab="account" selected={selected === "account"}>
            <SettingsCard label="Your account">
              <View style={{ gap: 12, paddingVertical: 0.5 * REM }}>
                <AccountSection />
              </View>
            </SettingsCard>
            <DeviceStudyCard />
          </Panel>
          <Panel tab="reading" selected={selected === "reading"}>
            <ReadingSettings />
          </Panel>
          <Panel tab="bible-translations" selected={selected === "bible-translations"}>
            <SettingsCard label="Bible translations" style={{ width: "100%", maxWidth: 40 * REM }}>
              <TranslationSettings active={selected === "bible-translations"} />
            </SettingsCard>
          </Panel>
          <Panel tab="study-tools" selected={selected === "study-tools"}>
            <SettingsCard label="Quick marks">
              <QuickMarkSettings />
            </SettingsCard>
          </Panel>
          <Panel tab="about" selected={selected === "about"}>
            <AboutSettings onOpenAccount={() => select("account")} />
          </Panel>
        </View>
        <View style={{ marginTop: 0.75 * REM }}>
          <QuietLink label="Privacy policy" hint="Opens versetogether.org/privacy in the browser" testID="settings-privacy-link" onPress={() => void openExternal(PRIVACY_URL)} />
        </View>
      </ScrollView>
    </View>
  );
}
