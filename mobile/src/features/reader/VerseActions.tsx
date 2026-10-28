// The text selection menu on phones (VerseActionBar.tsx and .selection-* in globals.css), in one card anchored
// above the bottom navigation: the reader's quick marks and Clear across the top, then the actions (Explore, Add
// to journal, Annotate, Translations, Share), and a footer with Copy text and the selection's reference.
//
// The selection is the reader's exact words (VerseTextRange: offsets in each verse's own text, from ScriptureText),
// as on the web. A mark goes on those words only, splitting or replacing marks only within them (the shared
// setVerseMarks rule with ranges), and its state comes from the marks on those words; Copy, Share, Add to journal
// and Explore take the selected words, a partial first or last verse included.
//
// Annotate opens a panel in the same card, in place of the actions (AnnotatePanel): the quick marks named in full,
// any style and color, prepared first and put on with Apply (or taken off with Remove), and "Write a note", which
// opens the full note editor on the first selected verse. A mark never touches a note or the other kind of mark.
// Back (or Android's back button) returns to the actions; a new selection reopens on them. Signed out, changes
// stay in DeviceStudyStore; signed in, verseStudy queues them for the account using the same web annotation rules.

import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ComponentRef, type Ref } from "react";
import { AccessibilityInfo, BackHandler, Keyboard, Platform, Pressable, ScrollView, Share, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, liftShadow, useBottomClearance, withAlpha, type IconName } from "../../components/ui";
import { webUrl } from "../../navigation/hrefs";
import {
  annotationChapter,
  buildShareUrl,
  customMarkColors,
  formatPassageReference,
  markPresetFullLabel,
  markPresetKey,
  markPresetPhrase,
  presetState,
  quickMarkPatch,
  scriptureExcerpt,
  scriptureSource,
  selectionMarks,
  type MarkPreset,
  type SelectionMarks,
  type VerseAnnotation,
  type VerseTextRange,
} from "../../shared/web";
import { useReaderPreferences } from "../../storage/preferences";
import { attempt } from "../../storage/study";
import { verseStudy } from "../../storage/verseAnnotations";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import type { Verse } from "../../data/scripture";
import { ExploreSheet, TranslationsSheet } from "../explore/ExploreSheet";
import { canCompare } from "../explore/translations";
import { setDraftIntent } from "../journal/draftIntent";
import MarkSample from "./MarkSample";
import MarkStylePicker, { type MarkStyle } from "./MarkStylePicker";
import { selectedWords, selectionKey as rangesKey } from "./scriptureDocument";
import VerseNoteSheet from "./VerseNoteSheet";

export type SelectionTarget = {
  volume: string;
  book: string;
  bookLabel: string;
  chapter: number;
  verses: Verse[];
  annotations: ReadonlyMap<number, VerseAnnotation>;
};

type Props = SelectionTarget & {
  /** The selected words, verse by verse, in order (one chapter's). */
  ranges: readonly VerseTextRange[];
  onClear: () => void;
  /** Extra room above the bottom (the navigation's height), so the panel never covers it. */
  bottomOffset?: number;
};

type PresetState = boolean | "mixed";

/**
 * One quick mark (.selection-preset): its sample alone, or with its full name (.selection-annotate-preset). Every
 * selected verse has it: a full ring; only some do: a thin one.
 */
export function PresetButton({ preset, state, onPress, showName = false }: { preset: MarkPreset; state: PresetState; onPress: () => void; showName?: boolean }) {
  const { colors } = useTheme();
  const on = state === true;
  const label = markPresetFullLabel(preset);
  return (
    <Pressable
      testID={`${showName ? "annotate-preset" : "quick-mark"}-${markPresetKey(preset)}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={on ? `Removes the ${markPresetPhrase(preset)} from the selected text` : undefined}
      accessibilityState={{ selected: on, checked: state === "mixed" ? "mixed" : on }}
      onPress={onPress}
      hitSlop={showName ? undefined : 4}
      style={({ pressed }) =>
        showName
          ? {
              maxWidth: "100%",
              minHeight: 40,
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              paddingVertical: 4,
              paddingLeft: on ? 4 : 5,
              paddingRight: on ? 11 : 12,
              borderRadius: 10,
              borderWidth: on ? 2 : 1,
              borderColor: on ? colors.foreground : state === "mixed" ? colors.foregroundSoft : colors.surfaceBorder,
              backgroundColor: on || pressed ? colors.surfaceCardSoft : "transparent",
            }
          : {
              width: 36,
              height: 36,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: on ? 2 : state === "mixed" ? 1 : 0,
              borderColor: on ? colors.foreground : colors.foregroundSoft,
              backgroundColor: on || pressed ? colors.surfaceCardSoft : "transparent",
            }
      }
    >
      <MarkSample preset={preset} />
      {showName ? <Text style={{ flexShrink: 1, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.foreground }}>{label}</Text> : null}
    </Pressable>
  );
}

function RoundButton({ icon, label, onPress, testID, size = 15, buttonRef }: { icon: IconName; label: string; onPress: () => void; testID?: string; size?: number; buttonRef?: Ref<ComponentRef<typeof Pressable>> }) {
  const { colors } = useTheme();
  return (
    <Pressable
      ref={buttonRef}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.surfaceCardSoft : "transparent" })}
    >
      <Icon name={icon} size={size} color={colors.foregroundSoft} />
    </Pressable>
  );
}

/** .selection-action (phone sizes): an icon tile, a title and a description. Featured ones carry the rubric tint. */
function Action({ icon, title, description, onPress, featured, wide, testID }: { icon: IconName; title: string; description: string; onPress: () => void; featured?: boolean; wide?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        width: wide ? "100%" : "48.5%",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: wide ? 58 : 70,
        paddingVertical: 11,
        paddingHorizontal: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: featured ? withAlpha(colors.accentRubric, 0.22) : wide ? colors.surfaceBorder : pressed ? colors.surfaceBorder : "transparent",
        backgroundColor: pressed ? colors.surfaceButtonHover : featured ? withAlpha(colors.accentRubric, 0.05) : "transparent",
      })}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: featured ? "transparent" : colors.surfaceBorder,
          backgroundColor: featured ? withAlpha(colors.accentRubric, 0.1) : colors.surfaceCard,
        }}
      >
        <Icon name={icon} size={14} color={featured ? colors.accentRubric : colors.foreground} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, lineHeight: 16, color: colors.foreground }}>{title}</Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 10, lineHeight: 13.5, color: colors.foregroundSoft }}>{description}</Text>
      </View>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, lineHeight: 14, letterSpacing: 0.44, textTransform: "uppercase", color: colors.foregroundSoft }}>
      {children}
    </Text>
  );
}

function markStateText(state: PresetState) {
  return state === true ? "On all the selected text" : state === "mixed" ? "On some of the selected text" : "Not on the selected text";
}

/**
 * The Annotate panel, in place of the card's actions: the reader's quick marks (named in full), any style and color
 * with an Apply button, and the note action. Choosing a style or color only prepares it; Apply puts it on all the
 * selected text (Remove when all of it already has it).
 */
function AnnotatePanel({
  presets,
  marks,
  noteLabel,
  onMark,
  onNote,
  onBack,
  onClear,
  maxBodyHeight,
}: {
  presets: readonly MarkPreset[];
  marks: SelectionMarks;
  noteLabel: string;
  onMark: (preset: MarkPreset) => void;
  onNote: () => void;
  onBack: () => void;
  onClear: () => void;
  maxBodyHeight: number;
}) {
  const { colors } = useTheme();
  const backRef = useRef<ComponentRef<typeof Pressable>>(null);
  const [custom, setCustom] = useState<MarkStyle>(() => {
    const first = presets[0];
    return first ? { kind: first.kind, color: first.color } : { kind: "highlight", color: "yellow" };
  });
  const customState = presetState(custom, marks);
  const customPhrase = markPresetPhrase(custom);
  // The reader's own colors, offered again: their quick marks' and the ones already on the selection.
  const customColors = customMarkColors([...presets.map((preset) => preset.color), ...marks.highlights, ...marks.underlines]);

  // Opening the panel moves a screen reader to its Back button, so it lands on the new choices.
  useEffect(() => {
    const back = backRef.current;
    if (back) AccessibilityInfo.sendAccessibilityEvent?.(back, "focus");
  }, []);

  return (
    <View testID="annotate-panel" accessibilityLabel="Annotate" style={{ flexShrink: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 6, paddingRight: 6, paddingBottom: 2, paddingLeft: 6 }}>
        <RoundButton buttonRef={backRef} icon="chevron-left" size={16} label="Back to selection actions" onPress={onBack} testID="annotate-back" />
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 14, lineHeight: 18, color: colors.foreground }}>
          Annotate
        </Text>
        <RoundButton icon="xmark" label="Clear selection" onPress={onClear} testID="clear-selection" />
      </View>
      <ScrollView
        style={{ flexGrow: 0, flexShrink: 1, maxHeight: maxBodyHeight }}
        contentContainerStyle={{ gap: 14, paddingTop: 2, paddingHorizontal: 10, paddingBottom: 12 }}
        keyboardShouldPersistTaps="handled"
        testID="annotate-body"
      >
        <View style={{ gap: 7 }}>
          <SectionLabel>Your quick marks</SectionLabel>
          {presets.length ? (
            <View accessibilityLabel="Your quick marks" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {presets.map((preset) => (
                <PresetButton key={markPresetKey(preset)} preset={preset} state={presetState(preset, marks)} showName onPress={() => onMark(preset)} />
              ))}
            </View>
          ) : (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.foregroundSoft }}>No quick marks saved. Choose them in Settings.</Text>
          )}
        </View>

        <View style={{ gap: 7 }}>
          <SectionLabel>Any style and color</SectionLabel>
          <MarkStylePicker value={custom} onChange={setCustom} label="Mark" customColors={customColors} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 6 }}>
            <Pressable
              testID="annotate-apply"
              accessibilityRole="button"
              accessibilityLabel={customState === true ? `Remove ${customPhrase}` : `Apply ${customPhrase}`}
              accessibilityState={{ checked: customState === "mixed" ? "mixed" : customState }}
              onPress={() => onMark(custom)}
              style={({ pressed }) => ({
                maxWidth: "100%",
                minHeight: 40,
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                paddingVertical: 4,
                paddingLeft: 5,
                paddingRight: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.foregroundSoft,
                backgroundColor: pressed ? colors.surfaceCardSoft : "transparent",
              })}
            >
              <MarkSample preset={custom} />
              <Text style={{ flexShrink: 1, fontFamily: fonts.sansSemiBold, fontSize: 12, lineHeight: 16, color: colors.foreground }}>
                {customState === true ? `Remove ${customPhrase}` : `Apply ${customPhrase}`}
              </Text>
            </Pressable>
            <Text testID="annotate-state" accessibilityLiveRegion="polite" style={{ fontFamily: fonts.sans, fontSize: 11, lineHeight: 15, color: colors.foregroundSoft }}>
              {markStateText(customState)}
            </Text>
          </View>
        </View>

        <Action wide icon="pen-to-square" title={noteLabel} description="Note and marks together" onPress={onNote} testID="annotate-note" />
      </ScrollView>
    </View>
  );
}

function selectedVerses(verses: Verse[], selected: number[]) {
  const set = new Set(selected);
  return verses.filter((verse) => set.has(verse.verse));
}

/** The software keyboard's height while it is open, so the card can stay above it and within the screen. */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

export default function VerseActions({ ranges, onClear, bottomOffset, ...target }: Props) {
  const { colors, scheme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const [prefs] = useReaderPreferences();
  const navClearance = useBottomClearance(-16);
  const sortedRanges = useMemo(() => [...ranges].sort((a, b) => a.verse - b.verse), [ranges]);
  const sorted = useMemo(() => sortedRanges.map((range) => range.verse), [sortedRanges]);
  // Different words of the same verses are a different selection.
  const selectionKey = `${target.volume}/${target.book}/${target.chapter}:${rangesKey(sortedRanges)}`;

  // The selection the Annotate panel is open on, or null: a new selection reopens on the actions, and its
  // messages start over.
  const [annotating, setAnnotating] = useState<string | null>(null);
  const [messageKey, setMessageKey] = useState(selectionKey);
  const [markError, setMarkError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  if (annotating !== null && annotating !== selectionKey) setAnnotating(null);
  if (messageKey !== selectionKey) {
    setMessageKey(selectionKey);
    setMarkError(null);
    setStatus(null);
    setCopy("idle");
  }
  const panelOpen = annotating === selectionKey;

  const [noteVerse, setNoteVerse] = useState<number | null>(null);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [translationsOpen, setTranslationsOpen] = useState(false);

  const marks = selectionMarks(sorted.map((verse) => target.annotations.get(verse) ?? null), sortedRanges);
  const reference = formatPassageReference(target.bookLabel, target.chapter, sorted);
  // The selected words of each verse (a partial first or last verse as selected), and the whole verses.
  const words: Verse[] = sortedRanges.map((range) => ({ verse: range.verse, text: range.text.slice(range.start, range.end) }));
  const wholeVerses = selectedVerses(target.verses, sorted);
  const plain = selectedWords(sortedRanges);
  const shareUrl = webUrl(buildShareUrl({ volume: target.volume, book: target.book, chapter: target.chapter, verses: sorted }));
  const first = sorted[0];
  const firstHasNote = !!target.annotations.get(first)?.body?.trim();
  // The note action opens the full editor on the first selected verse (ChapterReader's noteActionLabel).
  const noteLabel = sorted.length > 1 ? `Note on verse ${first}` : firstHasNote ? "Edit your note" : "Write a note";

  // Android's back button steps back from the panel to the actions, then clears the selection (the web's Escape).
  const onBackPress = useEffectEvent(() => {
    if (panelOpen) setAnnotating(null);
    else onClear();
  });
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onBackPress();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const mark = (preset: MarkPreset) =>
    setMarkError(
      attempt(() =>
        verseStudy.setVerseMarks(annotationChapter(target.volume, target.book, target.chapter), sorted, { ...quickMarkPatch(preset, marks), ranges: [...sortedRanges] })
      )
    );

  const addToJournal = () => {
    const last = sorted[sorted.length - 1];
    setDraftIntent({
      source: scriptureSource({ volume: target.volume, book: target.book, chapter: target.chapter, verseStart: first, verseEnd: last, reference }),
      body: `${scriptureExcerpt({ volume: target.volume, slug: target.book, label: target.bookLabel }, words.map((verse) => ({ chapter: target.chapter, verse: verse.verse, text: verse.text })))}\n\n`,
      reading: false,
      verseCount: target.verses.length,
    });
    onClear();
    router.push("/notes/new");
  };

  const share = async () => {
    try {
      const result = await Share.share({ title: reference, message: `“${plain}”\n— ${reference}\n${shareUrl}`, url: shareUrl });
      if (result.action === Share.sharedAction) setStatus("Shared");
    } catch {
      setStatus("Couldn't open sharing.");
    }
  };

  const copyText = async () => {
    try {
      await Clipboard.setStringAsync(`${plain}\n— ${reference}`);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  // Above the bottom navigation, or the keyboard while it is open (Android resizes the window for it; iOS doesn't),
  // and never taller than the room above that, so no action is ever off screen.
  const bottom = keyboard > 0 ? (Platform.OS === "ios" ? keyboard + 8 : 8) : bottomOffset ?? navClearance;
  const maxHeight = Math.max(0, windowHeight - insets.top - 12 - bottom);
  // The panel's header and the footer take about 100pt; the panel's own scroll gets the rest.
  const maxBodyHeight = Math.max(0, maxHeight - 100);

  const quickError = markError ? (
    <Text accessibilityRole="alert" style={{ paddingHorizontal: 18, paddingBottom: 4, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.accentRubric }}>
      {markError}
    </Text>
  ) : null;

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom, alignItems: "center", paddingHorizontal: 12 }}>
      <View
        testID="verse-actions"
        accessibilityLabel="Selection actions"
        style={[
          {
            width: "100%",
            maxWidth: 440,
            maxHeight,
            overflow: "hidden",
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.surfaceBorder,
            backgroundColor: colors.surfaceCardStrong,
          },
          liftShadow(scheme),
        ]}
      >
        {panelOpen ? (
          <>
            <AnnotatePanel
              presets={prefs.markPresets}
              marks={marks}
              noteLabel={noteLabel}
              onMark={mark}
              onNote={() => setNoteVerse(first)}
              onBack={() => setAnnotating(null)}
              onClear={onClear}
              maxBodyHeight={maxBodyHeight}
            />
            {quickError}
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: prefs.markPresets.length ? "space-between" : "flex-end", gap: 8, paddingTop: prefs.markPresets.length ? 6 : 2, paddingRight: 6, paddingBottom: prefs.markPresets.length ? 2 : 0, paddingLeft: 10 }}>
              {prefs.markPresets.length ? (
                <View accessibilityLabel="Quick marks for the selected text" style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                  {prefs.markPresets.map((preset) => (
                    <PresetButton key={markPresetKey(preset)} preset={preset} state={presetState(preset, marks)} onPress={() => mark(preset)} />
                  ))}
                </View>
              ) : null}
              <RoundButton icon="xmark" label="Clear selection" onPress={onClear} testID="clear-selection" />
            </View>
            {quickError}
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 6, paddingTop: 6, paddingHorizontal: 10, paddingBottom: 12 }}>
              <Action featured icon="wand-magic-sparkles" title="Explore" description="Meaning & context" onPress={() => setExploreOpen(true)} testID="action-explore" />
              <Action icon="plus" title="Add to journal" description="Quote it in a new entry" onPress={addToJournal} testID="action-journal" />
              <Action icon="pen-to-square" title="Annotate" description="Highlight, underline, or note" onPress={() => setAnnotating(selectionKey)} testID="action-annotate" />
              {canCompare(target.volume, target.book) ? (
                <Action icon="language" title="Translations" description="Compare the wording" onPress={() => setTranslationsOpen(true)} testID="action-translations" />
              ) : null}
              <Action featured icon="share-nodes" title="Share" description="Send the passage" onPress={() => void share()} testID="action-share" />
            </ScrollView>
            {status ? (
              <Text accessibilityLiveRegion="polite" style={{ paddingHorizontal: 18, paddingBottom: 6, fontFamily: fonts.sansMedium, fontSize: 12, color: colors.foregroundMuted }}>
                {status}
              </Text>
            ) : null}
          </>
        )}
        <View style={{ minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 10, paddingRight: 16, borderTopWidth: 1, borderTopColor: colors.rule, backgroundColor: colors.surfaceCard }}>
          <Pressable
            testID="action-copy"
            accessibilityRole="button"
            accessibilityLabel={copy === "copied" ? "Copied" : copy === "failed" ? "Couldn't copy, retry" : "Copy text"}
            onPress={() => void copyText()}
            style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 8, borderRadius: 8, opacity: pressed ? 0.7 : 1 })}
          >
            <Icon name={copy === "copied" ? "check" : "copy"} size={13} color={copy === "copied" ? colors.accentRubric : colors.foreground} />
            <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: copy === "copied" ? colors.accentRubric : colors.foreground }}>
              {copy === "copied" ? "Copied" : copy === "failed" ? "Couldn't copy · retry" : "Copy text"}
            </Text>
          </Pressable>
          <Text accessibilityRole="header" numberOfLines={2} style={{ flexShrink: 1, textAlign: "right", fontFamily: fonts.serif, fontSize: 15, lineHeight: 19.5, color: colors.foreground }}>
            {reference}
          </Text>
        </View>
      </View>
      <VerseNoteSheet
        visible={noteVerse != null}
        target={{ ...annotationChapter(target.volume, target.book, target.chapter), verse: noteVerse ?? first }}
        label={formatPassageReference(target.bookLabel, target.chapter, [noteVerse ?? first])}
        annotation={target.annotations.get(noteVerse ?? first) ?? null}
        onClose={() => setNoteVerse(null)}
      />
      <ExploreSheet visible={exploreOpen} onClose={() => setExploreOpen(false)} text={plain} reference={reference} context={{ volume: target.volume, book: target.book, chapter: target.chapter, verses: sorted, verseCount: target.verses.length }} />
      {canCompare(target.volume, target.book) ? (
        <TranslationsSheet visible={translationsOpen} onClose={() => setTranslationsOpen(false)} book={target.book} chapter={target.chapter} verses={wholeVerses} reference={reference} />
      ) : null}
    </View>
  );
}
