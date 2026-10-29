// The selection menu for a study guide's prose (the website's GuideSelectionMenu, in the phone's selection card as
// VerseActions draws it): the reader's quick marks and Clear, then Explore, Add to journal, Annotate and Share, and
// a footer with Copy text and "Study guide · <heading>". A mark or note belongs to exactly the selected text
// (guideAnchors.ts); saved passages the selection overlaps are listed in Annotate and can be selected in turn, but a
// change to the selection never reaches them. Translations and the verse resources are the scripture's, not offered.
//
// Reads and writes go through guideAnnotationStore (this device's study, or the account's), never the device store.

import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { AccessibilityInfo, BackHandler, Pressable, ScrollView, Share, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, liftShadow, useBottomClearance, withAlpha, type IconName } from "../../components/ui";
import RoundButton from "../../components/RoundButton";
import { webUrl } from "../../navigation/hrefs";
import {
  customMarkColors,
  markPresetKey,
  markPresetLabel,
  markPresetPhrase,
  presetState,
  quickMarkPatch,
  quotedExcerpt,
  type MarkPreset,
  type NoteSource,
  type SelectionMarks,
} from "../../shared/web";
import { useReaderPreferences } from "../../storage/preferences";
import { assertStudyIdentity, useStudyIdentity } from "../../storage/studySession";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import { guideSelectionMarks, guideSelectionTargets, type GuideHighlight, type PlacedGuideHighlight } from "@/features/comeFollowMe/guideAnchors";
import type { GuideAnnotationPatch } from "../../../../convex/annotationRules";
import { ExploreSheet } from "../explore/ExploreSheet";
import { setDraftIntent } from "../journal/draftIntent";
import MarkSample from "../reader/MarkSample";
import MarkStylePicker, { type MarkStyle } from "../reader/MarkStylePicker";
import { PresetButton } from "../reader/VerseActions";
import GuideAnnotationSheet from "./GuideAnnotationSheet";
import { deleteGuideAnnotation, setGuideAnnotation, type GuideAnnotationsState, type GuideAnnotationTarget } from "./guideAnnotationStore";
import type { ProseSelection } from "./GuideProse";

function Action({ icon, title, description, onPress, featured, wide, disabled, testID }: { icon: IconName; title: string; description: string; onPress: () => void; featured?: boolean; wide?: boolean; disabled?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
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
        opacity: disabled ? 0.55 : 1,
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

function Message({ children, tone = "muted" }: { children: string; tone?: "muted" | "alert" }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole={tone === "alert" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={{ paddingHorizontal: 18, paddingBottom: 6, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: tone === "alert" ? colors.accentRubric : colors.foregroundMuted }}
    >
      {children}
    </Text>
  );
}

const QUOTE_SNIPPET = 48;

function snippet(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > QUOTE_SNIPPET ? `${flat.slice(0, QUOTE_SNIPPET - 1).trimEnd()}…` : flat;
}

/** What a saved span holds: "Yellow highlight, red underline, note". */
export function spanSummary(row: GuideHighlight) {
  return [
    row.highlightColor ? markPresetLabel({ kind: "highlight", color: row.highlightColor }) : null,
    row.underlineColor ? markPresetLabel({ kind: "underline", color: row.underlineColor }) : null,
    row.body.trim() ? "note" : null,
  ]
    .filter((part): part is string => !!part)
    .map((part, index) => (index === 0 ? part : part.toLowerCase()))
    .join(", ");
}

/** The saved passages touching the selection (only when another one overlaps it), each selectable in turn. */
function SavedPassages({ exact, overlapping, onSelect }: { exact: PlacedGuideHighlight | null; overlapping: readonly PlacedGuideHighlight[]; onSelect: (item: PlacedGuideHighlight) => void }) {
  const { colors } = useTheme();
  if (overlapping.length === 0) return null;
  const items = (exact ? [exact, ...overlapping] : [...overlapping]).sort((a, b) => a.start - b.start || a.end - b.end);
  return (
    <View style={{ gap: 7 }} accessibilityLabel="Saved passages here">
      <SectionLabel>Saved passages here</SectionLabel>
      <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.foregroundSoft }}>Marks apply to exactly the selected text. Select a saved passage to change it.</Text>
      {items.map((item) => {
        const current = item === exact;
        return (
          <Pressable
            key={item.row.id}
            testID={`saved-passage-${item.row.id}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: current, selected: current }}
            accessibilityHint={current ? "This is the selected text" : "Selects this saved passage"}
            disabled={current}
            onPress={() => onSelect(item)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              minHeight: 44,
              padding: 8,
              borderRadius: 10,
              borderWidth: current ? 2 : 1,
              borderColor: current ? colors.foreground : colors.surfaceBorder,
              backgroundColor: pressed || current ? colors.surfaceCardSoft : "transparent",
            })}
          >
            <View style={{ gap: 3 }}>
              {item.row.highlightColor ? <MarkSample preset={{ kind: "highlight", color: item.row.highlightColor }} /> : null}
              {item.row.underlineColor ? <MarkSample preset={{ kind: "underline", color: item.row.underlineColor }} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.serif, fontSize: 14, color: colors.foreground }}>“{snippet(item.row.exact)}”</Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.foregroundSoft }}>{current ? `Selected · ${spanSummary(item.row)}` : spanSummary(item.row)}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function markStateText(state: boolean | "mixed") {
  return state === true ? "On all the selected text" : state === "mixed" ? "On some of the selected text" : "Not on the selected text";
}

/** Annotate, in place of the card's actions: quick marks named in full, any style and color, saved passages, the note. */
function AnnotatePanel({
  presets,
  marks,
  ready,
  noteReady,
  blocked,
  noteLabel,
  noteDescription,
  saved,
  onMark,
  onNote,
  onBack,
  onClear,
  maxBodyHeight,
}: {
  presets: readonly MarkPreset[];
  marks: SelectionMarks;
  ready: boolean;
  /** The note editor waits for marks still saving. */
  noteReady: boolean;
  blocked: string | null;
  noteLabel: string;
  noteDescription: string;
  saved: ReactNode;
  onMark: (preset: MarkPreset) => void;
  onNote: () => void;
  onBack: () => void;
  onClear: () => void;
  maxBodyHeight: number;
}) {
  const { colors } = useTheme();
  const backRef = useRef<ComponentRef<typeof Pressable>>(null);
  const [custom, setCustom] = useState<MarkStyle>(() => (presets[0] ? { kind: presets[0].kind, color: presets[0].color } : { kind: "highlight", color: "yellow" }));
  const customState = presetState(custom, marks);
  const customPhrase = markPresetPhrase(custom);
  const customColors = customMarkColors([...presets.map((preset) => preset.color), ...marks.highlights, ...marks.underlines]);

  useEffect(() => {
    const back = backRef.current;
    if (back) AccessibilityInfo.sendAccessibilityEvent?.(back, "focus");
  }, []);

  return (
    <View testID="guide-annotate-panel" accessibilityLabel="Annotate" style={{ flexShrink: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 6, paddingRight: 6, paddingBottom: 2, paddingLeft: 6 }}>
        <RoundButton buttonRef={backRef} icon="chevron-left" size={16} label="Back to selection actions" onPress={onBack} testID="annotate-back" />
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 14, lineHeight: 18, color: colors.foreground }}>
          Annotate
        </Text>
        <RoundButton icon="xmark" label="Clear selection" onPress={onClear} testID="clear-selection" />
      </View>
      <ScrollView style={{ flexGrow: 0, flexShrink: 1, maxHeight: maxBodyHeight }} contentContainerStyle={{ gap: 14, paddingTop: 2, paddingHorizontal: 10, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        {blocked ? (
          <Text testID="guide-annotate-blocked" style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.foregroundSoft }}>
            {blocked}
          </Text>
        ) : null}
        <View style={{ gap: 7, opacity: ready ? 1 : 0.55 }} pointerEvents={ready ? "auto" : "none"}>
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
          <MarkStylePicker value={custom} onChange={setCustom} label="Mark" customColors={customColors} disabled={!ready} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 6 }}>
            <Pressable
              testID="annotate-apply"
              accessibilityRole="button"
              accessibilityLabel={customState === true ? `Remove ${customPhrase}` : `Apply ${customPhrase}`}
              accessibilityState={{ disabled: !ready, checked: customState === "mixed" ? "mixed" : customState }}
              disabled={!ready}
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
                opacity: ready ? 1 : 0.55,
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
        {saved}
        <Action wide icon="pen-to-square" title={noteLabel} description={noteDescription} onPress={onNote} disabled={!noteReady} testID="annotate-note" />
      </ScrollView>
    </View>
  );
}

type Props = {
  /** The guide's key (its week start). */
  guide: string;
  /** The lesson, as notes name and link it. */
  noteSource: NoteSource;
  selection: ProseSelection;
  annotations: GuideAnnotationsState;
  /** The saved spans placed in the selection's part. */
  placed: readonly PlacedGuideHighlight[];
  onClear: () => void;
  /** Selects a saved span's words in place of the selection. */
  onSelectSaved: (item: PlacedGuideHighlight) => void;
};

export default function GuideActions(props: Props) {
  const identity = useStudyIdentity();
  return <GuideActionsSession key={identity} {...props} identity={identity} />;
}

function GuideActionsSession({ guide, noteSource, selection, annotations, placed, onClear, onSelectSaved, identity }: Props & { identity: number }) {
  const { colors, scheme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [prefs] = useReaderPreferences();
  const navClearance = useBottomClearance(-16);
  const { key, part, text, reference } = selection;
  const described = selection.described.ok ? selection.described : null;
  const { status, rows } = annotations;

  // The Annotate panel belongs to one selection; selecting a saved passage from it carries it over.
  const [annotating, setAnnotating] = useState<string | null>(null);
  const [carry, setCarry] = useState<{ from: string; to: string } | null>(null);
  const panelKey = carry && carry.to === key ? carry.from : key;
  const panelOpen = annotating !== null && annotating === panelKey;
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [notice, setNotice] = useState<{ key: string; message: string } | null>(null);
  const [copy, setCopy] = useState<{ key: string; state: "copied" | "failed" } | null>(null);
  const [editing, setEditing] = useState<{ anchor: GuideAnnotationTarget; quote: string; rowId: string | null } | null>(null);
  const [exploreOpen, setExploreOpen] = useState(false);

  const { exact, overlapping } = useMemo(
    () => (part && described ? guideSelectionTargets(placed, part, described.start, described.end) : { exact: null, overlapping: [] as PlacedGuideHighlight[] }),
    [placed, part, described]
  );
  // The selected span's row as it is now.
  const exactRow = exact ? (rows.find((row) => row.id === exact.row.id) ?? exact.row) : null;
  const marks = guideSelectionMarks(exactRow, overlapping.map((item) => item.row));
  const ready = status === "ready" && !!described && !!part;
  const blocked =
    status === "unavailable"
      ? "Guide marks aren't available right now"
      : status === "loading"
        ? "Loading your guide marks…"
        : !part
          ? "This text can't be annotated"
          : !selection.described.ok
            ? selection.described.reason === "too-long"
              ? "Select a shorter passage to annotate"
              : "Select some text to annotate"
            : null;

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

  const target = (): GuideAnnotationTarget | null =>
    part && described
      ? {
          guide,
          part,
          ...described.anchor,
          // A span still saving has no id yet: it's found by its anchor, which is this selection's.
          highlightId: exactRow && !exactRow.id.startsWith("pending:") ? exactRow.id : undefined,
        }
      : null;

  async function mark(patch: GuideAnnotationPatch) {
    const next = target();
    if (!next || !ready) return;
    setError(null);
    setPending((count) => count + 1);
    try {
      assertStudyIdentity(identity);
      await setGuideAnnotation(next, patch);
    } catch {
      setError({ key, message: "Couldn't save that mark. Try again." });
    } finally {
      setPending((count) => count - 1);
    }
  }

  const onMark = (preset: MarkPreset) => {
    const next = quickMarkPatch(preset, marks);
    // A verse's "underline off" is the guide's "no underline color".
    void mark(next.highlightColor !== undefined ? { highlightColor: next.highlightColor } : { underlineColor: next.underline === false ? null : (next.underlineColor ?? null) });
  };

  const lesson = noteSource.href.split("#")[0];
  const block = described?.anchor.startBlock ?? "";
  const linked = block ? `${lesson}#${block}` : lesson;

  const addToJournal = () => {
    const body = quotedExcerpt(text, { label: `${noteSource.label} · ${reference}`, href: linked });
    if (!body) return;
    setDraftIntent({ source: noteSource, body: `${body}\n\n`, reading: false });
    onClear();
    router.push("/notes/new");
  };

  const share = async () => {
    const url = webUrl(linked);
    try {
      const result = await Share.share({ title: noteSource.label, message: `“${text}”\n— ${noteSource.label}\n${url}`, url });
      if (result.action === Share.sharedAction) setNotice({ key, message: "Shared" });
    } catch {
      setNotice({ key, message: "Couldn't open sharing." });
    }
  };

  const copyText = async () => {
    try {
      await Clipboard.setStringAsync(text);
      setCopy({ key, state: "copied" });
    } catch {
      setCopy({ key, state: "failed" });
    }
  };
  const copied = copy?.key === key ? copy.state : null;

  const openEditor = () => {
    const anchor = target();
    if (!anchor || !ready || pending > 0 || !described) return;
    setEditing({ anchor, quote: described.anchor.exact, rowId: exactRow?.id ?? null });
  };
  // The span as saved now: the one the menu found (by id), else (one that was still saving) by its anchor.
  const editingRow = editing
    ? ((editing.rowId ? rows.find((row) => row.id === editing.rowId) : undefined) ??
      rows.find(
        (row) =>
          row.part === editing.anchor.part &&
          row.startBlock === editing.anchor.startBlock &&
          row.startOffset === editing.anchor.startOffset &&
          row.endBlock === editing.anchor.endBlock &&
          row.endOffset === editing.anchor.endOffset &&
          row.exact === editing.anchor.exact
      ) ??
      null)
    : null;

  const bottom = navClearance;
  const maxHeight = Math.max(0, windowHeight - insets.top - 12 - bottom);
  const maxBodyHeight = Math.max(0, maxHeight - 100);
  const errorText = error?.key === key ? error.message : null;
  const noteLabel = exactRow?.body.trim() ? "Edit your note" : "Write a note";
  const noteDescription = pending > 0 ? "Saving marks…" : "Note and marks together";

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom, alignItems: "center", paddingHorizontal: 12 }}>
      <View
        testID="guide-actions"
        accessibilityLabel="Selection actions"
        style={[
          { width: "100%", maxWidth: 440, maxHeight, overflow: "hidden", borderRadius: 20, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surfaceCardStrong },
          liftShadow(scheme),
        ]}
      >
        {panelOpen ? (
          <AnnotatePanel
            presets={prefs.markPresets}
            marks={marks}
            ready={ready}
            noteReady={ready && pending === 0}
            blocked={blocked}
            noteLabel={noteLabel}
            noteDescription={noteDescription}
            saved={
              <SavedPassages
                exact={exact}
                overlapping={overlapping}
                onSelect={(item) => {
                  setCarry({ from: panelKey, to: `${item.row.part}:${item.start}:${item.end}` });
                  onSelectSaved(item);
                }}
              />
            }
            onMark={onMark}
            onNote={openEditor}
            onBack={() => setAnnotating(null)}
            onClear={onClear}
            maxBodyHeight={maxBodyHeight}
          />
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 6, paddingRight: 6, paddingBottom: 2, paddingLeft: 10 }}>
              {ready && prefs.markPresets.length ? (
                <View accessibilityLabel="Quick marks for the selected text" style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                  {prefs.markPresets.map((preset) => (
                    <PresetButton key={markPresetKey(preset)} preset={preset} state={presetState(preset, marks)} onPress={() => onMark(preset)} />
                  ))}
                </View>
              ) : (
                <Text testID="guide-marks-blocked" style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.foregroundSoft }}>
                  {blocked ?? ""}
                </Text>
              )}
              <RoundButton icon="xmark" label="Clear selection" onPress={onClear} testID="clear-selection" />
            </View>
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 6, paddingTop: 6, paddingHorizontal: 10, paddingBottom: 12 }}>
              <Action featured icon="wand-magic-sparkles" title="Explore" description="Meaning & context" onPress={() => setExploreOpen(true)} testID="action-explore" />
              <Action icon="plus" title="Add to journal" description="Quote it in a new entry" onPress={addToJournal} testID="action-journal" />
              <Action icon="pen-to-square" title="Annotate" description={blocked ?? "Highlight, underline, or note"} onPress={() => setAnnotating(panelKey)} testID="action-annotate" />
              <Action featured icon="share-nodes" title="Share" description="Send the passage" onPress={() => void share()} testID="action-share" />
            </ScrollView>
          </>
        )}
        {errorText ? <Message tone="alert">{errorText}</Message> : null}
        {pending > 0 ? <Message>Saving marks…</Message> : null}
        {notice?.key === key ? <Message>{notice.message}</Message> : null}
        <View style={{ minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 10, paddingRight: 16, borderTopWidth: 1, borderTopColor: colors.rule, backgroundColor: colors.surfaceCard }}>
          <Pressable
            testID="action-copy"
            accessibilityRole="button"
            accessibilityLabel={copied === "copied" ? "Copied" : copied === "failed" ? "Couldn't copy, retry" : "Copy text"}
            onPress={() => void copyText()}
            style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 8, borderRadius: 8, opacity: pressed ? 0.7 : 1 })}
          >
            <Icon name={copied === "copied" ? "check" : "copy"} size={13} color={copied === "copied" ? colors.accentRubric : colors.foreground} />
            <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: copied === "copied" ? colors.accentRubric : colors.foreground }}>
              {copied === "copied" ? "Copied" : copied === "failed" ? "Couldn't copy · retry" : "Copy text"}
            </Text>
          </Pressable>
          <Text testID="guide-selection-reference" accessibilityRole="header" numberOfLines={2} style={{ flexShrink: 1, textAlign: "right", fontFamily: fonts.serif, fontSize: 15, lineHeight: 19.5, color: colors.foreground }}>
            {reference}
          </Text>
        </View>
      </View>
      <GuideAnnotationSheet
        visible={editing !== null}
        quote={editing?.quote ?? ""}
        current={editingRow}
        onSave={async (patch) => {
          if (!editing) return;
          assertStudyIdentity(identity);
          const currentId = editingRow && !editingRow.id.startsWith("pending:") ? editingRow.id : undefined;
          await setGuideAnnotation({ ...editing.anchor, highlightId: currentId }, patch);
          // The selection has done its job; clearing it lets the marks show.
          onClear();
        }}
        onDelete={
          editingRow
            ? async () => {
                assertStudyIdentity(identity);
                await deleteGuideAnnotation(editingRow);
                onClear();
              }
            : null
        }
        onClose={() => setEditing(null)}
      />
      <ExploreSheet visible={exploreOpen} onClose={() => setExploreOpen(false)} text={text} reference={reference} />
    </View>
  );
}
