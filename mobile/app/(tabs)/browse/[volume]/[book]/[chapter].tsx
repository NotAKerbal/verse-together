import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, BackHandler, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isBibleVolume } from "@/lib/bibleCanon";
import { chapterOverlayTranslations } from "@/lib/browseRoutes";
import { groupChapterStudyPathsByVerse } from "@/lib/chapterInsights";
import { readJstChapter } from "@/lib/jst";
import { FEATURED_BIBLES } from "@/lib/translationCatalog";
import { LdsContentGate } from "../../../../../src/components/HiddenContent";
import { Button, IconButton, Notice, PillBar, useBottomClearance } from "../../../../../src/components/ui";
import { loadChapterAsync, type ChapterText, type Verse } from "../../../../../src/data/scripture";
import { setDraftIntent } from "../../../../../src/features/journal/draftIntent";
import { readPassagesFromEntries, readVerseMap } from "../../../../../src/features/readingProgress";
import ChapterStudyNotices from "../../../../../src/features/reader/ChapterStudyNotices";
import StudyPathsStatus from "../../../../../src/features/reader/StudyPathsStatus";
import ChapterTranslationsSheet from "../../../../../src/features/reader/ChapterTranslationsSheet";
import JstExcerptCard from "../../../../../src/features/reader/JstExcerptCard";
import { journalRefsByVerse, type VerseNoteRef } from "../../../../../src/features/reader/journalRefs";
import { highlightFill } from "../../../../../src/features/reader/marks";
import { annotationHasMarks, buildReaderDocument, padRows, type Comparison, type ReaderExtrasStyle } from "../../../../../src/features/reader/readerDocument";
import { ComparisonCards, ComparisonCells, TWO_COLUMN_MIN_WIDTH, columnGeometry, useComparisonColumns } from "../../../../../src/features/reader/ComparisonColumns";
import { comparisonChapters } from "../../../../../src/features/reader/studyData";
import { useFaithTradition, useJstPreference } from "../../../../../src/features/reader/studySettings";
import StudyPathsSheet, { VerseNotesSheet } from "../../../../../src/features/reader/StudyPathsSheet";
import { useChapterStudyPaths, useComparisonOverlays, useJstChapter } from "../../../../../src/features/reader/useChapterStudy";
import VerseMarkers, { MARKER_GUTTER } from "../../../../../src/features/reader/VerseMarkers";
import ReaderSettingsSheet from "../../../../../src/features/reader/ReaderSettingsSheet";
import {
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
  groupVerseRuns,
  normalizeScriptureVolume,
  parseVerseSpec,
  scriptureCatalog,
  scriptureSource,
  toScriptureVolumeUrlSlug,
  type VerseAnnotation,
  type VerseTextRange,
} from "../../../../../src/shared/web";
import { defaultBibleNotice, sameBibleId, useDefaultBible, useSavedBibles, withComparison } from "../../../../../src/storage/bibleLibrary";
import { useReaderPreferences, useSimpleMode } from "../../../../../src/storage/preferences";
import { recordReadingPosition } from "../../../../../src/storage/readingPosition";
import { useStudySession } from "../../../../../src/storage/studySession";
import { useJournalData } from "../../../../../src/storage/journalData";
import { useChapterAnnotations } from "../../../../../src/storage/verseAnnotations";
import { useTheme, type Theme } from "../../../../../src/theme/theme";
import { fonts } from "../../../../../src/theme/tokens";

// `verses` are the primary text: the bundled LDS text, or the reader's default Bible (`translation`) for a Bible
// chapter, with a notice when that Bible couldn't load the chapter and the bundled text is shown instead.
type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: ChapterText; verses: Verse[]; translation?: string; notice?: string }
  | { status: "missing" }
  | { status: "error"; message: string };

const TEXT_WIDTHS = { comfortable: 672, wide: 880, full: 10000 } as const;
// The reading column's side padding, and how far the text reaches past it (its inset holds the rule and cards).
const PAGE_PADDING = 20;
const TEXT_BLEED = 8;
const TEXT_INSET = 12;
const SWIPE_DISTANCE = 80;
const NO_TRANSLATIONS: string[] = [];
const NO_VERSES: Verse[] = [];

// The web's comparison colors: the primary text's changed words in amber, each translation in its own color
// (Tailwind's 700 shades on paper, 300 in the dark theme).
const PRIMARY_CHANGE = { light: "#b45309", dark: "#fcd34d" };
const COMPARE_COLORS = {
  light: ["#0369a1", "#047857", "#4d7c0f", "#be123c", "#0e7490", "#a21caf"],
  dark: ["#7dd3fc", "#6ee7b7", "#bef264", "#fda4af", "#67e8f9", "#f0abfc"],
};

/** "BSB" for a featured Bible, else the translation id in capitals (formatTranslationShortLabel). */
function shortLabel(id: string | undefined): string {
  if (!id) return "UNKNOWN";
  if (id.toLowerCase() === "lds") return "LDS";
  return FEATURED_BIBLES.find((item) => item.id.toLowerCase() === id.toLowerCase())?.shortLabel ?? id.toUpperCase();
}

/** A route param's values, however the router delivers repeats (an array, or one comma-joined value). */
function paramValues(value: string | string[] | undefined): string[] {
  return (Array.isArray(value) ? value : value ? [value] : []).flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean);
}

function extrasStyle(theme: Theme, fontScale: number, serif: string): ReaderExtrasStyle {
  const { colors, scheme } = theme;
  const size = 14 * fontScale;
  return {
    primaryChange: PRIMARY_CHANGE[scheme],
    muted: colors.foregroundSoft,
    line: { font: serif, size, lineHeight: size * 1.7, color: colors.foreground },
    lineLabel: { font: fonts.sansSemiBold, size: 10, color: colors.foregroundMuted, letterSpacing: 0.06 },
    jstLabel: { font: fonts.sansSemiBold, size: 11, color: colors.foregroundMuted, letterSpacing: 0.03 },
    jstNumber: { font: fonts.sansMedium, size: 10, color: colors.foregroundMuted },
    jstOmitted: { font: serif, size: 16 * fontScale, color: colors.foregroundMuted, strikethrough: true },
    jstAddedUnderline: colors.foregroundSoft,
    aside: { font: fonts.sans, size: 12, lineHeight: 18, color: colors.foregroundMuted, style: "italic" },
    lineGap: 4,
    card: { border: colors.surfaceBorder, cellFill: scheme === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)" },
  };
}

/** The chapter, unless this device's faith tradition hides its volume (the web shows its notice instead). */
export default function ChapterRoute() {
  const params = useLocalSearchParams<{ volume: string }>();
  return (
    <LdsContentGate volume={normalizeScriptureVolume(String(params.volume))}>
      <ChapterScreen />
    </LdsContentGate>
  );
}

function ChapterScreen() {
  const params = useLocalSearchParams<{
    volume: string;
    book: string;
    chapter: string;
    verse?: string;
    verses?: string;
    translation?: string | string[];
    compare?: string | string[];
  }>();
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const volume = normalizeScriptureVolume(String(params.volume));
  const volumeSlug = toScriptureVolumeUrlSlug(volume);
  const book = String(params.book);
  const chapter = Number(params.chapter);
  const jumpVerse = params.verse ? Number(params.verse) : null;
  // A shared passage's verses ("21-28", "3,21-28"), picked out with the verse jumped to (app/share/…).
  const sharedSpec = typeof params.verses === "string" ? params.verses : "";
  const bible = isBibleVolume(volume);
  const [defaultBible] = useDefaultBible();
  const savedBibles = useSavedBibles();
  // The reader's default Bible is the main text of Bible chapters; every other volume reads the bundled text.
  const primaryRequested = bible ? defaultBible : "lds";
  // The chapter's comparison translations (its `translation`/`compare` params), never the main text again.
  const translationParam = paramValues(params.translation).join(",");
  const compareParam = paramValues(params.compare).join(",");
  const overlays = useMemo(
    () =>
      chapterOverlayTranslations(volume, { translation: translationParam ? translationParam.split(",") : [], compare: compareParam ? compareParam.split(",") : [] }).filter(
        (id) => !sameBibleId(id, primaryRequested)
      ),
    [volume, translationParam, compareParam, primaryRequested]
  );
  const overlayKey = overlays.join(",");
  // Its links to the chapters before and after carry the comparisons along, as the web's do.
  const chrome = useMemo(() => buildChapterChrome(scriptureCatalog, { volume, book, chapter }, overlayKey ? overlayKey.split(",") : []), [volume, book, chapter, overlayKey]);
  const bookLabel = scriptureCatalog.getBook(volume, book)?.label ?? book;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [positionError, setPositionError] = useState<string | null>(null);
  const [attemptKey, setAttemptKey] = useState(0);
  // The reader's selected words (exact ranges of each verse's text), or null.
  const [selection, setSelection] = useState<VerseTextRange[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [translationsOpen, setTranslationsOpen] = useState(false);
  const [showJstOmitted, setShowJstOmitted] = useState(false);
  const [openPathVerse, setOpenPathVerse] = useState<number | null>(null);
  const [notesVerse, setNotesVerse] = useState<{ verse: number; refs: VerseNoteRef[] } | null>(null);
  // Bumped whenever the text lays out again, so the markers beside it are placed again.
  const [layoutTick, setLayoutTick] = useState(0);
  const [flashing, setFlashing] = useState(jumpVerse !== null);
  const [swipe, setSwipe] = useState(0);
  const [prefs] = useReaderPreferences();
  const [simple, setSimple] = useSimpleMode();
  const { showLdsContent } = useFaithTradition();
  const [savedJst] = useJstPreference();
  const journal = useJournalData();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const textRef = useRef<ScriptureTextHandle>(null);
  const textTop = useRef(0);
  const [laidOut, setLaidOut] = useState(false);
  const { height: windowHeight, width: windowWidth, fontScale: systemFontScale } = useWindowDimensions();
  // The text's own width, as laid out (until then, as the reading column's width gives it).
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const bottomClearance = useBottomClearance(simple ? -60 : 0);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    setPositionError(null);
    setSelection(null);
    setLaidOut(false);
    setShowJstOmitted(false);
    setOpenPathVerse(null);
    loadChapterAsync(volume, book, chapter)
      .then(async (data) => {
        if (!live) return;
        if (!data) {
          setState({ status: "missing" });
          return;
        }
        let ready: Extract<LoadState, { status: "ready" }> = { status: "ready", data, verses: data.verses, translation: bible ? "lds" : undefined };
        if (bible && !sameBibleId(primaryRequested, "lds")) {
          // The default Bible's text, from the site as the web reads it; offline or failing, the bundled text with
          // the web's notice. A substituted answer (the site's own fallback) carries the same notice.
          try {
            const other = await comparisonChapters.load({ volume, book, chapter, translation: primaryRequested });
            ready = { ...ready, verses: other.verses, translation: other.translation ?? "lds", notice: defaultBibleNotice(primaryRequested, other.translation) };
          } catch {
            ready = { ...ready, notice: defaultBibleNotice(primaryRequested, "lds") };
          }
          if (!live) return;
        }
        setState(ready);
      })
      .catch((error: unknown) => {
        if (live) setState({ status: "error", message: error instanceof Error ? error.message : "The chapter couldn't be read." });
      });
    return () => {
      live = false;
    };
  }, [volume, volumeSlug, book, chapter, attemptKey, bible, primaryRequested]);

  const ready = state.status === "ready";
  // Once the chapter shows, it is the reader's position for whoever's study is shown (readingPosition.ts): this
  // device's signed out, the account's signed in, and again when that changes (signing in on this chapter).
  const study = useStudySession();
  const positionOwner = study.mode === "account" ? study.owner : study.mode;
  useEffect(() => {
    if (!ready) return;
    try {
      recordReadingPosition({ volume: volumeSlug, book, chapter });
      setPositionError(null);
    } catch {
      setPositionError("Your reading position couldn't be saved on this device. You can still read this chapter.");
    }
  }, [ready, positionOwner, volumeSlug, book, chapter]);
  const verses = state.status === "ready" ? state.verses : NO_VERSES;
  const primaryTranslation = state.status === "ready" ? state.translation : undefined;
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

  // Comparison translations, once the main text is on screen so they never compete with it (useComparisonChapters).
  const overlaySummary = useComparisonOverlays(volume, book, chapter, ready ? overlays : NO_TRANSLATIONS);
  const comparisons = useMemo<Comparison[]>(
    () =>
      overlaySummary.compareChapters.map((item, index) => ({
        id: item.translation,
        label: shortLabel(item.translation),
        color: COMPARE_COLORS[theme.scheme][index % COMPARE_COLORS.light.length],
        byVerse: new Map(item.verses.map((verse) => [verse.verse, verse.text])),
      })),
    [overlaySummary.compareChapters, theme.scheme]
  );
  const translationTitle = useCallback(
    (id: string | undefined) => {
      if (!id || id.toLowerCase() === "lds") return showLdsContent ? "King James Bible (LDS edition)" : "King James Bible";
      return savedBibles.find((item) => sameBibleId(item.id, id))?.label ?? FEATURED_BIBLES.find((item) => sameBibleId(item.id, id))?.label ?? id.toUpperCase();
    },
    [savedBibles, showLdsContent]
  );

  // The Joseph Smith Translation, read in place of the KJV verses it revises: only for the bundled LDS text, where
  // Latter-day Saint content shows and the reader turned it on (the web's jstEnabled).
  const jst = useJstChapter(volume, book, chapter, savedJst && showLdsContent && ready && primaryTranslation === "lds");
  const jstReading = useMemo(() => readJstChapter(jst.status === "ready" ? jst.excerpts : [], verses), [jst, verses]);
  const jstOmitsWording = useMemo(() => [...jstReading.rows.values()].some((row) => row.pieces.some((piece) => piece.kind === "omitted")), [jstReading]);
  const jstMarksKey = simple ? "" : [...jstReading.rows.keys()].filter((verse) => annotationHasMarks(annotations.get(verse))).join(",");

  // Chapter study paths are written from a Latter-day Saint perspective; the site serves those it has cached.
  const studyPaths = useChapterStudyPaths(volumeSlug, book, chapter, ready && showLdsContent);
  const pathsByVerse = useMemo(() => groupChapterStudyPathsByVerse(studyPaths.status === "ready" ? studyPaths.paths : []), [studyPaths]);
  // The reader's own journal notes that link to verses here (simple mode leaves them out, as the web does).
  const noteRefs = useMemo(
    () => (simple ? new Map<number, VerseNoteRef[]>() : journalRefsByVerse(journal.entries, journal.bodies, { volume, book, chapter })),
    [simple, journal.entries, journal.bodies, volume, book, chapter]
  );
  const pathVerses = useMemo(() => (simple ? [] : [...pathsByVerse.keys()].filter((verse) => verses.some((item) => item.verse === verse))), [simple, pathsByVerse, verses]);
  const markerVerses = useMemo(() => new Map([...noteRefs].filter(([verse]) => verses.some((item) => item.verse === verse))), [noteRefs, verses]);
  const hasMarkers = pathVerses.length > 0 || markerVerses.size > 0;

  const comparisonView = prefs.comparisonView;
  const primaryLabel = primaryTranslation?.toLowerCase() === "lds" && !showLdsContent ? "KJV" : shortLabel(primaryTranslation);
  const readerExtras = useMemo(
    () => extrasStyle({ colors, scheme: theme.scheme }, prefs.fontScale, prefs.fontFamily === "sans" ? fonts.sans : fonts.serif),
    [colors, theme.scheme, prefs.fontScale, prefs.fontFamily]
  );
  // Side by side, at the web's md breakpoint and wider, the translations sit in a column beside the main text.
  const wide = comparisonView === "sideBySide" && windowWidth >= TWO_COLUMN_MIN_WIDTH;
  const { document, extraMarks, cardDecorations, mirrors, rows } = useMemo(() => {
    const built = buildReaderDocument(
      verses.map((verse) => ({ verse: verse.verse, text: verse.text, note: simple ? null : annotations.get(verse.verse)?.body })),
      textStyle,
      {
        jstRows: jstReading.rows,
        showJstOmitted,
        comparisons,
        comparisonView,
        primaryLabel,
        columns: wide,
        hasMarks: (verse) => jstMarksKey.split(",").includes(String(verse)),
        style: readerExtras,
      }
    );
    return { document: built.document, extraMarks: built.marks, cardDecorations: built.decorations, mirrors: built.mirrors, rows: built.rows };
    // The notes are read through notesKey and JST verses' marks through jstMarksKey: a change to a verse's marks
    // alone keeps the same text.
  }, [verses, notesKey, simple, textStyle, jstReading, showJstOmitted, comparisons, comparisonView, wide, primaryLabel, jstMarksKey, readerExtras]);
  // Two columns only where a verse has its translations beside it; otherwise the text keeps the whole width.
  const twoColumns = rows.length > 0;
  const textRightInset = hasMarkers && !simple ? MARKER_GUTTER : TEXT_INSET;
  const textWidth = measuredWidth ?? Math.min(windowWidth, TEXT_WIDTHS[prefs.textWidth]) - 2 * PAGE_PADDING + 2 * TEXT_BLEED;
  const geometry = columnGeometry(textWidth, textRightInset);
  const columns = useComparisonColumns({
    rows,
    textRef,
    measureKey: twoColumns ? `${geometry.leftWidth}|${geometry.cellLeft}|${geometry.cellWidth}|${systemFontScale}|${prefs.fontScale}|${prefs.fontFamily}|${document.text}` : "",
    layoutTick,
  });
  // The native text, with the space after each verse whose translations run taller than it (same text, same offsets).
  const shownDocument = useMemo(() => padRows(document, rows, columns.padding), [document, rows, columns.padding]);
  // A verse's marks are drawn on its words, and on the copies of them in its later side-by-side cards.
  const marks = useMemo(
    () => [...documentMarks({ ...document, verses: [...document.verses, ...mirrors] }, (verse) => annotations.get(verse)), ...extraMarks],
    [document, mirrors, annotations, extraMarks]
  );
  // The verse jumped to, or a shared passage's verses, picked out for a moment.
  const flashVerses = useMemo(() => {
    if (!flashing || jumpVerse === null) return new Set<number>();
    const shared = sharedSpec ? parseVerseSpec(sharedSpec, verses.length) : null;
    return new Set(shared?.length ? shared : [jumpVerse]);
  }, [flashing, jumpVerse, sharedSpec, verses.length]);
  const decorations = useMemo(() => {
    const out: DocumentDecoration[] = [];
    // One box around each run of them.
    for (const run of groupVerseRuns([...flashVerses])) {
      const first = verseRegion(document, run.start);
      const last = verseRegion(document, run.end);
      if (first && last) {
        out.push({ start: first.blockStart, end: last.blockEnd, kind: "box", fill: colors.accentSkySoft, stroke: colors.surfaceBorder, strokeWidth: 2, radius: 8, outsetX: 12, outsetTop: 8, outsetBottom: 8 });
      }
    }
    // Side-by-side comparison cards, over the flash so they read through it.
    out.push(...cardDecorations);
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
  }, [document, cardDecorations, flashVerses, annotations, readMap, simple, colors, verses.length]);

  useEffect(() => {
    if (state.status !== "ready" || !jumpVerse || !laidOut) return;
    if (!verseRegion(document, jumpVerse)) return;
    let live = true;
    setFlashing(true);
    const timer = setTimeout(() => {
      void textRef.current?.verseTop(jumpVerse).then((top) => {
        if (live && top >= 0) scrollRef.current?.scrollTo({ y: Math.max(0, textTop.current + top - windowHeight * 0.15), animated: false });
      });
    }, 60);
    const clear = setTimeout(() => setFlashing(false), 2600);
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
  // Android's back button leaves simple mode before it leaves the chapter (a selection's own menu handles it first).
  useEffect(() => {
    if (!simple) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setSimple(false);
      return true;
    });
    return () => subscription.remove();
  }, [simple, setSimple]);

  // Shows or hides one comparison in this chapter only (BibleTranslationToolbar): the chapter's params change in
  // place, so its scroll position and the reader's place are kept.
  const setShown = useCallback(
    (id: string, on: boolean) => {
      const next = withComparison(overlays, id, on);
      router.setParams({ translation: next[0] ?? undefined, compare: next.length > 1 ? next.slice(1) : undefined } as never);
    },
    [overlays, router]
  );

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
        {bible ? <IconButton icon="language" label="Bible translations" onPress={() => setTranslationsOpen(true)} testID="reader-translations" /> : null}
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
      {state.status === "ready" && state.notice ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Notice tone="warning">{showLdsContent ? state.notice : state.notice.replace("King James Bible (LDS edition)", "King James Bible")}</Notice>
        </View>
      ) : null}
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
              paddingHorizontal: PAGE_PADDING,
              paddingTop: 8,
              paddingBottom: bottomClearance + (selection ? 260 : 0),
              width: "100%",
              maxWidth: TEXT_WIDTHS[prefs.textWidth],
              alignSelf: "center",
            }}
          >
            <ChapterStudyNotices
              primary={{
                label: primaryLabel,
                title: translationTitle(primaryTranslation),
                color: PRIMARY_CHANGE[theme.scheme],
              }}
              legend={comparisons.map((item) => ({ id: item.id, label: item.label, title: translationTitle(item.id), color: item.color }))}
              pending={overlaySummary.pendingTranslations}
              notices={overlaySummary.translationNotices}
              onRetryComparisons={overlaySummary.retry}
              jst={jst}
              jstReading={jstReading}
              jstOmitsWording={jstOmitsWording}
              showJstOmitted={showJstOmitted}
              onToggleJstOmitted={() => setShowJstOmitted((shown) => !shown)}
            />
            <StudyPathsStatus paths={studyPaths} />
            {jstReading.leading.map((excerpt) => (
              <JstExcerptCard key={excerpt.id} excerpt={excerpt} />
            ))}
            <View
              testID="reader-text-columns"
              onLayout={(event) => {
                textTop.current = event.nativeEvent.layout.y;
                const width = Math.round(event.nativeEvent.layout.width);
                if (width > 0) setMeasuredWidth((current) => (current === width ? current : width));
              }}
              style={{ marginHorizontal: -TEXT_BLEED, minHeight: twoColumns ? columns.minHeight : undefined }}
            >
              {twoColumns ? <ComparisonCards rows={rows} columns={columns} geometry={geometry} style={readerExtras} /> : null}
              <ScriptureText
                ref={textRef}
                testID="reader-text"
                document={shownDocument}
                marks={marks}
                decorations={decorations}
                selection={selection}
                onSelectionChange={setSelection}
                textInset={[TEXT_INSET, textRightInset]}
                onLaidOut={() => {
                  setLaidOut(true);
                  setLayoutTick((tick) => tick + 1);
                }}
                style={twoColumns ? { width: geometry.leftWidth } : undefined}
              />
              {twoColumns ? <ComparisonCells rows={rows} columns={columns} geometry={geometry} style={readerExtras} /> : null}
              {hasMarkers && !simple ? (
                <VerseMarkers
                  textRef={textRef}
                  left={twoColumns ? geometry.leftWidth - MARKER_GUTTER : undefined}
                  layoutKey={`${layoutTick}:${document.text.length}`}
                  pathVerses={pathVerses}
                  openPathVerse={openPathVerse}
                  notes={markerVerses}
                  onTogglePaths={(verse) => setOpenPathVerse((open) => (open === verse ? null : verse))}
                  onOpenNotes={(verse, refs) => {
                    if (refs.length === 1) router.push(`/notes/entry/${encodeURIComponent(refs[0].noteId)}` as never);
                    else setNotesVerse({ verse, refs });
                  }}
                />
              ) : null}
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
      <StudyPathsSheet paths={openPathVerse === null ? [] : pathsByVerse.get(openPathVerse) ?? []} onClose={() => setOpenPathVerse(null)} />
      <VerseNotesSheet
        verse={notesVerse?.verse ?? null}
        refs={notesVerse?.refs ?? []}
        onClose={() => setNotesVerse(null)}
        onChoose={(noteId) => {
          setNotesVerse(null);
          router.push(`/notes/entry/${encodeURIComponent(noteId)}` as never);
        }}
      />
      {bible ? <ChapterTranslationsSheet visible={translationsOpen} onClose={() => setTranslationsOpen(false)} shown={overlays} onShownChange={setShown} /> : null}
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
