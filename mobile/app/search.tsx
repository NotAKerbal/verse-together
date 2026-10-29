import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, IconButton, Notice } from "../src/components/ui";
import { VOLUME_IDS, type VolumeId } from "../src/data/scripture";
import { MAX_VERSE_RESULTS, searchScriptures, type SearchResults } from "../src/data/search";
import { chapterPath } from "../src/navigation/hrefs";
import { getScriptureVolumeLabel } from "../src/shared/web";
import { isLdsVolume, useFaithTradition } from "../src/storage/faithTradition";
import { useTheme } from "../src/theme/theme";
import { fonts } from "../src/theme/tokens";

/**
 * Results this device shows: Other denominations keeps only the Bible's (the web filters its results the same way).
 * The Bible is searched first, so verse matches past the limit can only be the Bible's when all 40 shown are.
 */
export function visibleResults(results: SearchResults, showLdsContent: boolean): SearchResults {
  if (showLdsContent) return results;
  const verses = results.verses.filter((group) => !isLdsVolume(group.volume));
  const shown = verses.reduce((sum, group) => sum + group.matchedVerses.length, 0);
  return { references: results.references.filter((item) => !isLdsVolume(item.volume)), verses, truncated: results.truncated && shown >= MAX_VERSE_RESULTS };
}

type Row =
  | { kind: "heading"; id: string; text: string }
  | { kind: "reference"; id: string; result: SearchResults["references"][number] }
  | { kind: "verses"; id: string; result: SearchResults["verses"][number] };

export default function SearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const { showLdsContent } = useFaithTradition();
  const [chosenVolume, setVolume] = useState<VolumeId | undefined>();
  const volumes = VOLUME_IDS.filter((id) => showLdsContent || !isLdsVolume(id));
  const volume = chosenVolume && volumes.includes(chosenVolume) ? chosenVolume : undefined;
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);
  // Close search, then open the passage in Browse (the reader is pushed onto Browse's own stack).
  const openFromModal = (path: string) => {
    if (router.canDismiss()) router.dismiss();
    router.push(path as never);
  };

  useEffect(() => {
    const trimmed = query.trim();
    const id = ++run.current;
    if (!trimmed) {
      setResults(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(() => {
      try {
        const next = visibleResults(searchScriptures(trimmed, { volume }), showLdsContent);
        if (id === run.current) {
          setResults(next);
          setError(null);
        }
      } catch (problem) {
        if (id === run.current) setError(problem instanceof Error ? problem.message : "Search failed.");
      } finally {
        if (id === run.current) setBusy(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query, volume, showLdsContent]);

  const rows: Row[] = [];
  if (results?.references.length) {
    rows.push({ kind: "heading", id: "h-ref", text: "References" });
    results.references.forEach((result) => rows.push({ kind: "reference", id: `r-${result.id}`, result }));
  }
  if (results?.verses.length) {
    rows.push({ kind: "heading", id: "h-verses", text: results.truncated ? "Verses (first 40 matches)" : "Verses" });
    results.verses.forEach((result) => rows.push({ kind: "verses", id: `v-${result.id}`, result }));
  }

  const chip = (value: VolumeId | undefined, label: string) => {
    const active = volume === value;
    return (
      <Pressable
        key={label}
        accessibilityRole="radio"
        accessibilityState={{ checked: active }}
        onPress={() => setVolume(value)}
        style={{ minHeight: 36, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: active ? colors.surfaceButtonActive : colors.surfaceButton }}
      >
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: active ? colors.surfaceButtonActiveText : colors.foreground }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, paddingLeft: 16, paddingRight: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surfaceCard }}>
          <Icon name="magnifying-glass" size={15} color={colors.foregroundSoft} />
          <TextInput
            testID="search-input"
            accessibilityLabel="Search scriptures"
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={showLdsContent ? "Alma 32, 1 Ne 3:7, or words like faith" : "John 3:16, Genesis 1, or words like faith"}
            placeholderTextColor={colors.foregroundSoft}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            style={{ flex: 1, fontFamily: fonts.sans, fontSize: 16, color: colors.foreground, paddingVertical: 12 }}
          />
          <IconButton icon="xmark" label="Close search" onPress={() => router.back()} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel="Search in" contentContainerStyle={{ gap: 8 }}>
          {chip(undefined, "All")}
          {volumes.map((id) => chip(id, getScriptureVolumeLabel(id)))}
        </ScrollView>
      </View>
      {error ? (
        <View style={{ padding: 16 }}>
          <Notice tone="warning">{error}</Notice>
        </View>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={
          busy ? (
            <View accessibilityLiveRegion="polite" accessibilityLabel="Searching" style={{ paddingVertical: 12 }}>
              <ActivityIndicator color={colors.foregroundMuted} />
            </View>
          ) : results && rows.length === 0 ? (
            <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.foregroundMuted }}>
              {`No matches. Try a reference like “${showLdsContent ? "Mosiah 2" : "Psalm 23"}” or fewer words.`}
            </Text>
          ) : !results ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: colors.foregroundSoft }}>
              {showLdsContent
                ? "Search the standard works on this device: go to a reference, or find verses by their words."
                : "Search the Bible on this device: go to a reference, or find verses by their words."}
            </Text>
          ) : undefined
        }
        renderItem={({ item }) => {
          if (item.kind === "heading") {
            return <Text accessibilityRole="header" style={{ marginTop: 6, fontFamily: fonts.sansSemiBold, fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase", color: colors.accentRubric }}>{item.text}</Text>;
          }
          if (item.kind === "reference") {
            const { result } = item;
            return (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${result.label}, ${result.volumeTitle}`}
                onPress={() => openFromModal(chapterPath(result.volume, result.book, result.chapter, result.verse))}
                style={({ pressed }) => ({ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: pressed ? colors.surfaceButtonHover : colors.surfaceCard })}
              >
                <Text style={{ fontFamily: fonts.serif, fontSize: 19, color: colors.foreground }}>{result.label}</Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundSoft }}>{result.volumeTitle}</Text>
              </Pressable>
            );
          }
          const { result } = item;
          return (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${result.reference}, verses ${result.verseLabel}`}
              onPress={() => openFromModal(chapterPath(result.volume, result.book, result.chapter, result.matchedVerses[0]))}
              style={({ pressed }) => ({ padding: 14, gap: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: pressed ? colors.surfaceButtonHover : colors.surfaceCard })}
            >
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.foreground }}>
                  {result.reference}
                  <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.foregroundSoft }}>{`:${result.verseLabel}`}</Text>
                </Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: colors.foregroundSoft }}>{result.volumeTitle}</Text>
              </View>
              {result.snippets.map((snippet) => (
                <Text key={snippet.verseNumber} style={{ fontFamily: fonts.serif, fontSize: 15, lineHeight: 22, color: colors.foregroundMuted }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.accentRubric }}>{`${snippet.verseNumber}  `}</Text>
                  {snippet.snippet}
                </Text>
              ))}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
