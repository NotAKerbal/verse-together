// The website's release notes (src/features/settings/ReleaseNotes.tsx, from src/lib/releaseNotes.ts), shown in About
// and named as the website's history: versetogether.org's versions (2.x) are not this app's, which has its own
// (1.0.x, shown above them from the build's config). The three latest releases show, then "Earlier releases"; a
// screenshot opens larger. Screenshots are the website's own, bundled with the app (releaseNoteImages.ts).

import { Image } from "expo-image";
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CURRENT_VERSION, RELEASES, UNRELEASED, formatReleaseDate, type Release, type ReleaseNoteItem, type ReleaseScreenshot } from "@/lib/releaseNotes";
import { Icon, IconButton } from "../../components/ui";
import { useTheme } from "../../theme/theme";
import { fonts, radii, REM } from "../../theme/tokens";
import { RELEASE_NOTE_IMAGES } from "./releaseNoteImages";
import { CardHeader, SettingsCard } from "./SettingsParts";

const RECENT_COUNT = 3;
const KIND_LABELS = { new: "New", improved: "Improved" } as const;

function releaseDates(release: Release): string {
  return release.since ? `${formatReleaseDate(release.since)} – ${formatReleaseDate(release.date)}` : formatReleaseDate(release.date);
}

function Screenshot({ shot, onOpen }: { shot: ReleaseScreenshot; onOpen: (shot: ReleaseScreenshot) => void }) {
  const { colors } = useTheme();
  const source = RELEASE_NOTE_IMAGES[shot.src];
  const caption = (
    <Text style={{ fontFamily: fonts.sans, fontSize: 0.72 * REM, lineHeight: 0.72 * REM * 1.5, color: colors.foregroundMuted }}>
      {shot.caption}
      {shot.currentInterface ? <Text style={{ fontStyle: "italic" }}> Shown in today’s website interface.</Text> : null}
    </Text>
  );
  if (!source) return caption;
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`${shot.alt} (view larger)`}
        onPress={() => onOpen(shot)}
        style={{ borderRadius: radii.md, overflow: "hidden", borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surfaceCardSoft }}
      >
        <Image source={source} style={{ width: "100%", aspectRatio: shot.width / shot.height }} contentFit="cover" accessible={false} />
      </Pressable>
      {caption}
    </View>
  );
}

function Items({ items, onOpen }: { items: ReleaseNoteItem[]; onOpen: (shot: ReleaseScreenshot) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {items.map((item) => (
        <View key={item.text} style={{ flexDirection: "row", gap: 10 }}>
          <Text style={{ width: 64, paddingTop: 1, fontFamily: fonts.sansSemiBold, fontSize: 0.68 * REM, letterSpacing: 0.6, textTransform: "uppercase", color: item.kind === "new" ? colors.accentRubric : colors.foregroundSoft }}>
            {KIND_LABELS[item.kind]}
          </Text>
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 0.82 * REM, lineHeight: 0.82 * REM * 1.5, color: colors.foreground }}>{item.text}</Text>
            {item.screenshot ? <Screenshot shot={item.screenshot} onOpen={onOpen} /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function Entry({ release, onOpen }: { release: Release; onOpen: (shot: ReleaseScreenshot) => void }) {
  const { colors } = useTheme();
  return (
    <View testID={`website-release-${release.version}`} style={{ gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.rule }}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 0.72 * REM, color: colors.foregroundMuted }}>{`Website ${release.version} · ${releaseDates(release)}`}</Text>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 1 * REM, lineHeight: 1 * REM * 1.3, color: colors.foreground }}>
          {release.title}
        </Text>
      </View>
      <Items items={release.items} onOpen={onOpen} />
    </View>
  );
}

function ScreenshotViewer({ shot, onClose }: { shot: ReleaseScreenshot | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const source = shot ? RELEASE_NOTE_IMAGES[shot.src] : undefined;
  return (
    <Modal visible={!!shot} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.88)", paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16, paddingHorizontal: 12, gap: 12 }}>
        <View style={{ alignItems: "flex-end" }}>
          <IconButton icon="xmark" label="Close screenshot" iconColor="#ffffff" onPress={onClose} />
        </View>
        {shot && source ? (
          <>
            <Image source={source} style={{ flex: 1, width: "100%" }} contentFit="contain" accessibilityLabel={shot.alt} />
            <Text style={{ fontFamily: fonts.sans, fontSize: 0.8 * REM, lineHeight: 0.8 * REM * 1.5, color: "#ffffff", textAlign: "center" }}>{shot.caption}</Text>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

export default function WebsiteReleaseNotes({ appVersion }: { appVersion: string | null }) {
  const { colors } = useTheme();
  const [viewing, setViewing] = useState<ReleaseScreenshot | null>(null);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const recent = RELEASES.slice(0, RECENT_COUNT);
  const earlier = RELEASES.slice(RECENT_COUNT);
  return (
    <SettingsCard label="Website release notes" testID="website-release-notes">
      <CardHeader title="Website release notes" meta={`versetogether.org · Version ${CURRENT_VERSION}, released ${formatReleaseDate(RELEASES[0].date)}`} />
      <Text style={{ marginTop: -0.5 * REM, marginBottom: 0.25 * REM, fontFamily: fonts.sans, fontSize: 0.78 * REM, lineHeight: 0.78 * REM * 1.55, color: colors.foregroundMuted }}>
        {`What has changed on the Verse Together website, release by release. Website versions are not this app’s: you’re using the app ${
          appVersion ? `version ${appVersion}` : "build shown above"
        }, and some website features aren’t in the app.`}
      </Text>
      <View style={{ gap: 4, paddingBottom: 6 }}>
        {UNRELEASED.items.length > 0 ? (
          <View testID="website-release-unreleased" style={{ gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.rule }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 0.72 * REM, color: colors.foregroundMuted }}>Unreleased on the website · In development</Text>
              <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 1 * REM, color: colors.foreground }}>
                {UNRELEASED.title}
              </Text>
            </View>
            <Items items={UNRELEASED.items} onOpen={setViewing} />
          </View>
        ) : null}
        {recent.map((release) => (
          <Entry key={release.version} release={release} onOpen={setViewing} />
        ))}
        {earlier.length > 0 ? (
          <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.rule }}>
            <Pressable
              testID="website-release-earlier"
              accessibilityRole="button"
              accessibilityState={{ expanded: earlierOpen }}
              onPress={() => setEarlierOpen(!earlierOpen)}
              style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.85 * REM, color: colors.foreground }}>Earlier website releases</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontFamily: fonts.sans, fontSize: 0.72 * REM, color: colors.foregroundMuted }}>{`${earlier[earlier.length - 1].version}–${earlier[0].version}`}</Text>
                <Icon name={earlierOpen ? "chevron-up" : "chevron-down"} size={11} color={colors.foregroundMuted} />
              </View>
            </Pressable>
            {earlierOpen ? earlier.map((release) => <Entry key={release.version} release={release} onOpen={setViewing} />) : null}
          </View>
        ) : null}
      </View>
      <ScreenshotViewer shot={viewing} onClose={() => setViewing(null)} />
    </SettingsCard>
  );
}
