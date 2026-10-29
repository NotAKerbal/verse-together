// One whole-card link in the Library grid (BrowseCard.tsx and .browse-card in globals.css): an eyebrow and a
// chevron on top, a serif title (and an optional line) at the bottom, and decorative art on the right that fades
// out to the left so the text column reads over the plain card.

import { Image } from "expo-image";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { publicImage } from "../data/images";
import { useTheme } from "../theme/theme";
import { fonts, REM } from "../theme/tokens";
import { ChevronCircle, PressCard, withAlpha } from "./ui";

type Props = {
  eyebrow: string;
  title: string;
  description?: string;
  /** Path under public/, e.g. "/art/browse-notes.webp". */
  image?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
  trailing?: ReactNode;
};

export default function BrowseCard({ eyebrow, title, description, image, onPress, accessibilityLabel, testID }: Props) {
  const { colors, scheme } = useTheme();
  const source = image ? publicImage(image) : null;
  return (
    <PressCard
      onPress={onPress}
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? [eyebrow, title, description].filter(Boolean).join(", ")}
      style={{ minHeight: source ? 156 : 144, padding: 20, justifyContent: "space-between", gap: 12 }}
    >
      {source ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: "46%", opacity: scheme === "dark" ? 0.85 : 1 }}>
          <Image source={source} style={{ width: "100%", height: "100%" }} contentFit="cover" accessible={false} />
          {/* mask-image: linear-gradient(to left, #000 45%, transparent), drawn as the card color over the art. */}
          <View
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `linear-gradient(to left, ${withAlpha(colors.surfaceCard, 0)} 45%, ${colors.surfaceCard} 100%)`,
            }}
          />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <Text
          style={{
            maxWidth: source ? "62%" : undefined,
            flexShrink: 1,
            fontFamily: fonts.sansBold,
            fontSize: 0.68 * REM,
            letterSpacing: 0.1 * 0.68 * REM,
            textTransform: "uppercase",
            color: colors.foregroundMuted,
          }}
        >
          {eyebrow}
        </Text>
        <ChevronCircle />
      </View>
      <View style={{ maxWidth: source ? "62%" : undefined }}>
        <Text
          style={{
            fontFamily: fonts.serif,
            fontWeight: "500",
            fontSize: source ? 1.3 * REM : 1.6 * REM,
            lineHeight: (source ? 1.3 : 1.6) * REM * 1.08,
            letterSpacing: -0.03 * 1.3 * REM * 0.4,
            color: colors.foreground,
          }}
        >
          {title}
        </Text>
        {description ? (
          <Text style={{ marginTop: 4, fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.foregroundMuted }}>{description}</Text>
        ) : null}
      </View>
    </PressCard>
  );
}
