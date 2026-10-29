import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { HiddenContentNotice, useLdsContentHidden } from "../../../../../src/components/HiddenContent";
import SelectionHeader from "../../../../../src/components/SelectionHeader";
import { Notice, Page } from "../../../../../src/components/ui";
import { readPassagesFromEntries } from "../../../../../src/features/readingProgress";
import { chapterPath } from "../../../../../src/navigation/hrefs";
import { buildBookView, normalizeScriptureVolume, scriptureCatalog, singleChapterBookHref } from "../../../../../src/shared/web";
import { useContinueReadingPosition } from "../../../../../src/storage/readingPosition";
import { useJournalData } from "../../../../../src/storage/journalData";
import { useTheme } from "../../../../../src/theme/theme";
import { fonts } from "../../../../../src/theme/tokens";

export default function BookScreen() {
  const { volume: volumeParam, book } = useLocalSearchParams<{ volume: string; book: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { entries } = useJournalData();
  const position = useContinueReadingPosition();
  const volume = normalizeScriptureVolume(String(volumeParam));
  const hidden = useLdsContentHidden({ volume });
  if (hidden) return <HiddenContentNotice />;
  const single = singleChapterBookHref(scriptureCatalog, volume, String(book));
  if (single) return <Redirect href={single as never} />;
  const view = buildBookView(scriptureCatalog, volume, String(book));
  const back = () => (router.canGoBack() ? router.back() : router.replace((view?.backHref ?? "/browse") as never));

  if (!view) {
    return (
      <Page gap={16}>
        <SelectionHeader title={String(book).replace(/-/g, " ")} onBack={back} />
        <Notice>No chapter list available.</Notice>
      </Page>
    );
  }

  const read = new Set(readPassagesFromEntries(entries, volume, view.book).map((passage) => passage.chapter));
  const current = position && normalizeScriptureVolume(position.volume) === volume && position.book === view.book ? position.chapter : null;
  const columns = width >= 1024 ? (view.compact ? 12 : 9) : width >= 640 ? (view.compact ? 8 : 6) : view.compact ? 5 : 4;
  const gap = 9.6;
  const cell = (Math.min(width, 1180) - 32 - gap * (columns - 1)) / columns;
  const delineation = view.delineation;

  return (
    <Page gap={16}>
      <SelectionHeader title={view.label} onBack={back} />
      <Text style={{ paddingHorizontal: 4, fontFamily: fonts.sansBold, fontSize: 11.5, letterSpacing: 1.15, textTransform: "uppercase", color: colors.foregroundSoft }}>
        {view.chapterCount} {delineation.toLowerCase()}
        {view.chapterCount === 1 ? "" : "s"}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
        {Array.from({ length: view.chapterCount }, (_, index) => index + 1).map((chapter) => {
          const isRead = read.has(chapter);
          const isCurrent = current === chapter;
          const status = isCurrent ? (isRead ? "read, current" : "current") : isRead ? "read" : null;
          return (
            <Pressable
              key={chapter}
              testID={`chapter-${chapter}`}
              accessibilityRole="link"
              accessibilityLabel={`${delineation} ${chapter}${status ? ` (${status})` : ""}`}
              onPress={() => router.push(chapterPath(volume, view.book, chapter) as never)}
              style={({ pressed }) => ({
                width: cell,
                minHeight: 54,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 13.6,
                borderWidth: 1,
                borderColor: pressed ? colors.ruleStrong : colors.surfaceBorder,
                backgroundColor: isCurrent ? colors.accentPrimary : isRead ? colors.accentMint : pressed ? colors.surfaceButtonHover : colors.surfaceCard,
              })}
            >
              <Text style={{ fontFamily: fonts.serif, fontWeight: "500", fontSize: 18.4, color: isCurrent ? "#17161a" : colors.foreground }}>{chapter}</Text>
            </Pressable>
          );
        })}
      </View>
    </Page>
  );
}
