// A shared passage link (the web's /share/<volume>/<book>/<chapter>/<verses>, buildShareUrl in passageShare.ts)
// opened in the app: the chapter in the reader, at the passage's first verse, with the shared verses picked out.
// The link is checked as the web's share page checks it (a known book and chapter, a verse spec that names verses
// in that chapter); one that isn't a passage says so instead.

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Button } from "../../../../../src/components/ui";
import { normalizeScriptureVolume, parseVerseSpec, scriptureCatalog, serializeVerseSpec, toScriptureVolumeUrlSlug } from "../../../../../src/shared/web";
import { useTheme } from "../../../../../src/theme/theme";
import { fonts } from "../../../../../src/theme/tokens";

/** The reader's path for a shared passage, or null when the link names no verses of a chapter in the library. */
export function sharedPassagePath(params: { volume?: string; book?: string; chapter?: string; verses?: string }): string | null {
  const volume = normalizeScriptureVolume(String(params.volume ?? ""));
  const book = String(params.book ?? "");
  const rawChapter = String(params.chapter ?? "");
  if (!/^\d+$/.test(rawChapter)) return null;
  const chapter = Number(rawChapter);
  const entry = scriptureCatalog.getBook(volume, book);
  if (!entry || !scriptureCatalog.hasChapter(volume, book, chapter)) return null;
  const verses = parseVerseSpec(String(params.verses ?? ""), entry.verseCounts[chapter - 1] ?? 0);
  if (!verses) return null;
  const spec = serializeVerseSpec(verses);
  return `/browse/${toScriptureVolumeUrlSlug(volume)}/${book}/${chapter}?verse=${verses[0]}&verses=${encodeURIComponent(spec)}`;
}

export default function SharedPassage() {
  const params = useLocalSearchParams<{ volume: string; book: string; chapter: string; verses: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const path = sharedPassagePath(params);
  if (path) return <Redirect href={path as never} />;
  return (
    <View style={{ flex: 1, alignItems: "flex-start", justifyContent: "center", padding: 24, gap: 16, backgroundColor: colors.background }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 30, color: colors.foreground }}>
        Passage not found
      </Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: colors.foregroundMuted }}>This share link doesn’t name verses in the scripture library.</Text>
      <Button label="Go to Browse" onPress={() => router.replace("/browse")} />
    </View>
  );
}
