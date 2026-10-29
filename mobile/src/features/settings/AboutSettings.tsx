// Settings → About: the app's own version (from the build's app config), what is bundled for offline reading, the
// website's release notes (named as the website's: its versions aren't the app's), help by email, the privacy policy,
// and how to delete an account. Feedback has its own section, as on the web.

import Constants from "expo-constants";
import { Platform, Text, View } from "react-native";
import { openExternal } from "../../components/Blocks";
import { Button } from "../../components/ui";
import { nativeGuides } from "../../cfm/guides";
import { WEB_ORIGIN } from "../../navigation/hrefs";
import { scriptureCatalog } from "../../shared/web";
import { useTheme } from "../../theme/theme";
import { fonts, REM } from "../../theme/tokens";
import { CardHeader, SettingsCard } from "./SettingsParts";
import WebsiteReleaseNotes from "./WebsiteReleaseNotes";

/** The privacy policy's contact (src/app/privacy/page.tsx) and the Play listing's support address. */
export const SUPPORT_EMAIL = "isaachcochran@gmail.com";
export const PRIVACY_URL = `${WEB_ORIGIN}/privacy`;
export const DELETE_ACCOUNT_URL = `${WEB_ORIGIN}/delete-account`;

/** "1.0.4 (5)": the version and build number this build was made with, or null when the config isn't there. */
export function appVersion(): string | null {
  const config = Constants.expoConfig;
  const version = config?.version;
  if (!version) return null;
  const build = Platform.OS === "android" ? config?.android?.versionCode : Platform.OS === "ios" ? config?.ios?.buildNumber : undefined;
  return build ? `${version} (${build})` : version;
}

function Body({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontFamily: fonts.sans, fontSize: 0.8 * REM, lineHeight: 0.8 * REM * 1.55, color: colors.foregroundMuted }}>{children}</Text>;
}

export default function AboutSettings({ onOpenAccount, onOpenFeedback }: { onOpenAccount: () => void; onOpenFeedback?: () => void }) {
  const version = appVersion();
  return (
    <View style={{ gap: 0.75 * REM }}>
      <SettingsCard label="Verse Together for Android and iOS">
        <CardHeader title="Verse Together" meta={version ? `Version ${version}` : "Version unavailable in this build"} />
        <View style={{ gap: 8, paddingBottom: 6 }}>
          <Body>{`Scripture: the standard works (${scriptureCatalog.version}), King James Version for the Bible, bundled for offline reading. Come, Follow Me: ${nativeGuides().length} published study guides and the 2026 schedule, bundled with this version.`}</Body>
          <Body>Browse and book art are original generated scenery with no people. Lesson paintings are public-domain works credited on each lesson.</Body>
        </View>
      </SettingsCard>

      <WebsiteReleaseNotes appVersion={version} />

      <SettingsCard label="Help">
        <CardHeader title="Help and feedback" meta="By email" />
        <View style={{ gap: 10, paddingBottom: 6 }}>
          <Body>Questions, problems or ideas for Verse Together. Every message is read: send it from Feedback, or by email.</Body>
          {onOpenFeedback ? <Button variant="secondary" icon="comment-dots" label="Go to Feedback" style={{ alignSelf: "flex-start" }} onPress={onOpenFeedback} /> : null}
          <Button
            variant="secondary"
            icon="envelope"
            label="Email Verse Together"
            accessibilityHint={`Writes to ${SUPPORT_EMAIL}`}
            style={{ alignSelf: "flex-start" }}
            onPress={() => void openExternal(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Verse Together app${version ? ` ${version}` : ""}`)}`)}
          />
        </View>
      </SettingsCard>

      <SettingsCard label="Privacy and your data">
        <CardHeader title="Privacy and your data" />
        <View style={{ gap: 10, paddingBottom: 6 }}>
          <Body>Signed out, your journal, notes, marks and settings stay on this device. Looking up a word or a translation sends that request over the internet.</Body>
          <Button variant="secondary" icon="shield-halved" label="Privacy policy" accessibilityRole="link" style={{ alignSelf: "flex-start" }} onPress={() => void openExternal(PRIVACY_URL)} />
          <Body>To delete your Verse Together account and the study saved in it, sign in under Account and choose Delete my account, or use the website.</Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Button variant="secondary" icon="user" label="Go to Account" onPress={onOpenAccount} />
            <Button variant="secondary" icon="arrow-up-right-from-square" label="Delete account on the web" accessibilityRole="link" onPress={() => void openExternal(DELETE_ACCOUNT_URL)} />
          </View>
        </View>
      </SettingsCard>
    </View>
  );
}
