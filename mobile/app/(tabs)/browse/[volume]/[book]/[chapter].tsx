import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, IconButton, Notice, PillBar, useBottomClearance } from "../../../../../src/components/ui";
import { loadChapterAsync, type ChapterText } from "../../../../../src/data/scripture";
import { setDraftIntent } from "../../../../../src/features/journal/draftIntent";
import { readPassagesFromEntries, readVerseMap } from "../../../../../src/features/readingProgress";
import { highlightFill } from "../../../../../src/features/reader/marks";
import ReaderSettingsSheet from "../../../../../src/features/reader/ReaderSettingsSheet";
import {
  buildScriptureDocument,
  documentMarks,
  verseRegion,
  type DocumentDecoration,
  type ScriptureStyle,
} from "../../../../../src/features/reader/scriptureDocument";
import ScriptureText, { type ScriptureTextHandle } from "../../../../../src/features/reader/ScriptureText";
import VerseActions from "../../../../../src/features/reader/VerseActions";
import { toAppHref } from "../../../../../src/navigation/hrefs";
import {
  annotationChapter,
  buildChapterChrome,
  normalizeScriptureVolume,
  scriptureCatalog,
  scriptureSource,
  toScriptureVolumeUrlSlug,
  type VerseAnnotation,
  type VerseTextRange,
} from "../../../../../src/shared/web";
import { lastPosition, useReaderPreferences, useSimpleMode } from "../../../../../src/storage/preferences";
import { useJournalData } from "../../../../../src/storage/journalData";
import { useChapterAnnotations } from "../../../../../src/storage/verseAnnotations";
import { useTheme } from "../../../../../src/theme/theme";
import { fonts } from "../../../../../src/theme/tokens";

type LoadState = { status: "loading" } | { status: "ready"; data: ChapterText } | { status: "missing" } | { status: "error"; message: string };

const TEXT_WIDTHS = { comfortable: 672, wide: 880, full: 10000 } as const;
const SWIPE_DISTANCE = 80;

export default function ChapterScreen() {
  const params = useLocalSearchParams<{ volume: string; book: string; chapter: string; verse?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const volume = normalizeScriptureVolume(String(params.volume));
  const volumeSlug = toScriptureVolumeUrlSlug(volume);
  const book = String(params.book);
  const chapter = Number(params.chapter);
  const jumpVerse = params.verse ? Number(params.verse) : null;
  const chrome = useMemo(() => buildChapterChrome(scriptureCatalog, { volume, book, chapter }), [volume, book, chapter]);
  const bookLabel = scriptureCatalog.getBook(volume, book)?.label ?? book;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [positionError, setPositionError] = useState<string | null>(null);
  const [attemptKey, setAttemptKey] = useState(0);
  // The reader's selected words (exact ranges of each verse's text), or null.
  const [selection, setSelection] = useState<VerseTextRange[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flash, setFlash] = useState<number | null>(jumpVerse);
  const [swipe, setSwipe] = useState(0);
  const [prefs] = useReaderPreferences();
  const [simple, setSimple] = useSimpleMode();
  const journal = useJournalData();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const textRef = useRef<ScriptureTextHandle>(null);
  const textTop = useRef(0);
  const [laidOut, setLaidOut] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const bottomClearance = useBottomClearance(simple ? -60 : 0);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    setPositionError(null);
    setSelection(null);
    setLaidOut(false);
    loadChapterAsync(volume, book, chapter)
      .then((data) => {
        if (!live) return;
        setState(data ? { status: "ready", data } : { status: "missing" });
        if (data) {
          try {
            lastPosition.set({ volume: volumeSlug, book, chapter, at: new Date().toISOString() });
          } catch {
            setPositionError("Your reading position couldn't be saved on this device. You can still read this chapter.");
          }
        }
      })
      .catch((error: unknown) => {
        if (live) setState({ status: "error", message: error instanceof Error ? error.message : "The chapter couldn't be read." });
      });
    return () => {
      live = false;
    };
  }, [volume, volumeSlug, book, chapter, attemptKey]);

  const verses = state.status === "ready" ? state.data.verses : [];
  // The verse notes and marks of whoever's study is shown: this device's, or the signed-in account's.
  const annotations = useChapterAnnotations(annotationChapter(volume, book, chapter)) as Map<number, VerseAnnotation>;
  const readMap = useMemo(() => readVerseMap(readPassagesFromEntries(journal.entries, volume, book), chapter, verses.length), [journal.entries, volume, book, chapter, verses.length]);

  // The chapter as one selectable text (.reader-verse): rubric verse numbers, the reader's face and size, and each
  // verse's note card beneath it. Its text changes only with the verses, their notes, or the reader's settings, so
  // a mark going on or off never resets the selection.
  const textStyle: ScriptureStyle = useMemo(() => {
    const size = 16 * prefs.fontScale;
    return {
      body: { font: prefs.fontFamily === "sans" ? fonts.sans : fonts.serif, size, lineHeight: size * 1.75, color: colors.foreground },
      number: { font: fonts.sansSemiBold, size: 11.5 * Math.max(1, prefs.fontScale * 0.9), color: colors.accentRubric },
      verseSpacing: 24,
      note: {
        layout: "card",
        label: { font: fonts.sansMedium, size: 11, color: colors.foregroundSoft, letterSpacing: 0.8 / 11 },
        body: { font: fonts.sans, size: 14, lineHeight: 24, color: colors.foreground },
        gap: 8,
      },
    };
  }, [prefs.fontScale, prefs.fontFamily, colors]);
  const notesKey = simple ? "" : verses.map((verse) => annotations.get(verse.verse)?.body?.trim() ?? "").join("\u0001");
  const document = useMemo(
    () => buildScriptureDocument(verses.map((verse) => ({ verse: verse.verse, text: verse.text, note: simple ? null : annotations.get(verse.verse)?.body })), textStyle),
    // The notes are read through notesKey: a change to a verse's marks alone keeps the same text.
    [verses, notesKey, simple, textStyle]
  );
  const marks = useMemo(() => documentMarks(document, (verse) => annotations.get(verse)), [document, annotations]);
  const decorations = useMemo(() => {
    const out: DocumentDecoration[] = [];
    for (const region of document.verses) {
      if (flash === region.verse) {
        out.push({ start: region.blockStart, end: region.blockEnd, kind: "box", fill: colors.accentSkySoft, stroke: colors.surfaceBorder, strokeWidth: 2, radius: 8, outsetX: 12, outsetTop: 8, outsetBottom: 8 });
      }
    }
    for (const region of document.verses) {
      if (!region.note) continue;
      const color = annotations.get(region.verse)?.highlight_color;
      out.push({ start: region.note.start, end: region.note.end, kind: "box", fill: color ? highlightFill(colors, color) : colors.accentNote, stroke: colors.surfaceBorder, strokeWidth: 1, radius: 8, outsetX: 8, outsetTop: 8, outsetBottom: 8 });
    }
    // The margin line of logged reading, one per logged run of verses.
    if (!simple) {
      const runs = new Map([...readMap.values()].map((run) => [`${run.start}-${run.end}`, run]));
      for (const run of runs.values()) {
        const first = verseRegion(document, run.start);
        const last = verseRegion(document, Math.min(run.end, verses.length));
        if (first && last) out.push({ start: first.blockStart, end: last.blockEnd, kind: "rule", fill: colors.readerRead, x: -12, width: 2, outsetTop: -8 });
      }
    }
    return out;
  }, [document, flash, annotations, readMap, simple, colors, verses.length]);

  useEffect(() => {
    if (state.status !== "ready" || !jumpVerse || !laidOut) return;
    if (!verseRegion(document, jumpVerse)) return;
    let live = true;
    setFlash(jumpVerse);
    const timer = setTimeout(() => {
      void textRef.current?.verseTop(jumpVerse).then((top) => {
        if (live && top >= 0) scrollRef.current?.scrollTo({ y: Math.max(0, textTop.current + top - windowHeight * 0.15), animated: false });
      });
    }, 60);
    const clear = setTimeout(() => setFlash(null), 2600);
    return () => {
      live = false;
      clearTimeout(timer);
      clearTimeout(clear);
    };
    // Once the chapter's text has laid out; later layout changes (a note added) never jump back.
  }, [state.status, jumpVerse, laidOut]);

  const goTo = useCallback((href?: string) => {
    if (href) router.replace(toAppHref(href) as never);
  }, [router]);
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/browse/${volumeSlug}/${book}` as never));
  const openLog = () => {
    setDraftIntent({
      source: scriptureSource({ volume: volumeSlug, book, chapter, reference: chrome.reference }),
      body: "",
      reading: true,
      verseCount: verses.length || undefined,
    });
    router.push("/notes/new");
  };

  // Swipe between chapters, as the web reader does; the buttons below the text do the same. Never while text is
  // selected (and a long press claims its own touch natively, cancelling the swipe), so selecting is never a swipe.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(!selection)
    .activeOffsetX([-24, 24])
    .failOffsetY([-14, 14])
    .onUpdate((event) => setSwipe(event.translationX))
    .onEnd((event) => {
      setSwipe(0);
      if (event.translationX < -SWIPE_DISTANCE && chrome.nextHref) goTo(chrome.nextHref);
      else if (event.translationX > SWIPE_DISTANCE && chrome.prevHref) goTo(chrome.prevHref);
    })
    .onFinalize(() => setSwipe(0));

  const neighbour = (href?: string) => {
    if (!href) return null;
    const match = /\/(\d+)(?:\?|$)/.exec(href);
    return match ? `${bookLabel} ${match[1]}` : null;
  };
  const swipeLabel = swipe < -30 ? neighbour(chrome.nextHref) : swipe > 30 ? neighbour(chrome.prevHref) : null;

  const header = simple ? (
    <View style={{ paddingTop: 4, paddingBottom: 12, gap: 4 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 30, lineHeight: 36, color: colors.foreground }}>
        {chrome.reference}
      </Text>
    </View>
  ) : (
    <PillBar style={{ marginBottom: 12 }}>
      <IconButton icon="chevron-left" label="Go back" onPress={back} />
      <IconButton icon="magnifying-glass" label="Search scriptures" onPress={() => router.push("/search")} />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${chrome.reference}: choose a chapter`}
        onPress={() => router.navigate(`/browse/${volumeSlug}/${book}` as never)}
        style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: 6, borderRadius: 22, backgroundColor: pressed ? colors.surfaceButtonHover : "transparent" })}
      >
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.foreground }}>
          {chrome.reference}
        </Text>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 4, borderLeftWidth: 1, borderLeftColor: colors.surfaceBorder }}>
        <IconButton icon="pen" label={`Log reading of ${chrome.reference}`} onPress={openLog} testID="reader-log" />
        <IconButton icon="eye" label="Turn simple mode on" onPress={() => setSimple(true)} />
        <IconButton icon="gear" label="Reader settings" onPress={() => setSettingsOpen(true)} testID="reader-settings-button" />
      </View>
    </PillBar>
  );

  const footer = (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingTop: 24 }} accessibilityLabel="Chapter navigation">
      {chrome.prevHref ? <Button variant="secondary" label={`← ${neighbour(chrome.prevHref) ?? "Previous"}`} accessibilityLabel={`Previous: ${neighbour(chrome.prevHref)}`} onPress={() => goTo(chrome.prevHref)} /> : <View />}
      {chrome.nextHref ? <Button variant="secondary" label={`${neighbour(chrome.nextHref) ?? "Next"} →`} accessibilityLabel={`Next: ${neighbour(chrome.nextHref)}`} onPress={() => goTo(chrome.nextHref)} /> : <View />}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: Math.max(insets.top, 12) + 4, paddingHorizontal: 12, width: "100%", maxWidth: 1180, alignSelf: "center" }}>{header}</View>
      {positionError ? <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}><Notice tone="warning">{positionError}</Notice></View> : null}
      {state.status === "loading" ? (
        <View accessibilityLiveRegion="polite" accessibilityLabel={`Loading ${chrome.reference}`} style={{ paddingTop: 48, alignItems: "center" }}>
          <ActivityIndicator color={colors.foregroundMuted} />
        </View>
      ) : state.status === "missing" ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Notice tone="warning">{`${chrome.reference} isn't in the scripture library.`}</Notice>
          <Button variant="secondary" label="Back to Browse" onPress={() => router.navigate("/browse")} />
        </View>
      ) : state.status === "error" ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Notice tone="warning">{`${chrome.reference} couldn't be opened: ${state.message}`}</Notice>
          <Button variant="secondary" label="Try again" onPress={() => setAttemptKey((key) => key + 1)} />
        </View>
      ) : (
        <GestureDetector gesture={pan}>
          <ScrollView
            ref={scrollRef}
            testID="reader-verses"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: bottomClearance + (selection ? 260 : 0),
              width: "100%",
              maxWidth: TEXT_WIDTHS[prefs.textWidth],
              alignSelf: "center",
            }}
          >
            <View onLayout={(event) => (textTop.current = event.nativeEvent.layout.y)} style={{ marginHorizontal: -8 }}>
              <ScriptureText
                ref={textRef}
                testID="reader-text"
                document={document}
                marks={marks}
                decorations={decorations}
                selection={selection}
                onSelectionChange={setSelection}
                textInset={[12, 12]}
                onLaidOut={() => setLaidOut(true)}
              />
            </View>
            {footer}
          </ScrollView>
        </GestureDetector>
      )}
      {swipeLabel ? (
        <View pointerEvents="none" style={{ position: "absolute", top: "45%", [swipe < 0 ? "right" : "left"]: 16, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surfaceButtonActive }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.surfaceButtonActiveText }}>{swipe < 0 ? `${swipeLabel} →` : `← ${swipeLabel}`}</Text>
        </View>
      ) : null}
      {simple ? (
        <View style={{ position: "absolute", bottom: Math.max(insets.bottom, 14), alignSelf: "center" }}>
          <Button label="Exit simple mode" icon="eye-slash" onPress={() => setSimple(false)} testID="exit-simple-mode" />
        </View>
      ) : null}
      {selection && state.status === "ready" ? (
        <VerseActions
          volume={volumeSlug}
          book={book}
          bookLabel={bookLabel}
          chapter={chapter}
          verses={verses}
          annotations={annotations}
          ranges={selection}
          onClear={() => setSelection(null)}
          bottomOffset={simple ? Math.max(insets.bottom, 14) + 60 : undefined}
        />
      ) : null}
      <ReaderSettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onMore={() => {
          setSettingsOpen(false);
          router.push({ pathname: "/settings", params: { tab: "study-tools" } });
        }}
      />
    </View>
  );
}
