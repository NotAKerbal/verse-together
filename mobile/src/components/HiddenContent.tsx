// What a screen shows in place of Latter-day Saint content when this device's faith tradition is Other
// denominations (the web's AppMain.tsx notice): reached by a link, a saved position or a typed address, the content
// stays hidden and the notice points to the Bible and to the setting.

import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { isLdsContentPath, isLdsVolume, useFaithTradition } from "../storage/faithTradition";
import { Button, Card, Page, Serif, Txt } from "./ui";

export function HiddenContentNotice({ withNav = true }: { withNav?: boolean }) {
  const router = useRouter();
  return (
    <Page withNav={withNav} testID="hidden-content">
      <Card style={{ padding: 24, gap: 8 }}>
        <Serif accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28 }}>
          Content hidden by your faith tradition
        </Serif>
        <Txt style={{ fontSize: 15, lineHeight: 22 }}>You can change your faith tradition in Settings → Reading.</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
          <Button variant="secondary" icon="book-bible" label="Browse the Bible" onPress={() => router.navigate("/browse")} />
          <Button variant="secondary" icon="gear" label="Settings" onPress={() => router.push("/settings?tab=reading")} />
        </View>
      </Card>
    </Page>
  );
}

/** True when this device hides the content of a volume (`volume`) or an app path (`href`, e.g. "/come-follow-me"). */
export function useLdsContentHidden({ volume, href }: { volume?: string; href?: string }): boolean {
  const { showLdsContent } = useFaithTradition();
  if (showLdsContent) return false;
  return (volume !== undefined && isLdsVolume(volume)) || (href !== undefined && isLdsContentPath(href));
}

/** Its children, or the notice when this device hides that volume's or path's content. */
export function LdsContentGate({ volume, href, withNav, children }: { volume?: string; href?: string; withNav?: boolean; children: ReactNode }) {
  const hidden = useLdsContentHidden({ volume, href });
  return hidden ? <HiddenContentNotice withNav={withNav} /> : <>{children}</>;
}
