// A journal entry's editor (JournalEntryComposer.tsx and JournalNoteEditor.tsx): an optional reading chip naming
// the passage or lesson (with Whole chapter / Verses and the day), the Markdown writer with a preview, and Save
// entry. A new entry stores nothing until saved; an entry with neither note nor reading is refused. Saved entries
// save with their revision (a change made elsewhere is reported, never overwritten) and can be deleted.
//
// Signed in, the entry is the account's (journalData.ts): Save keeps the change on the device at once and sends it
// when connected; the editor shows whether it has synced, and when the entry was also changed on the website, offers
// the choice (keep mine, use the newer version, or save mine as a new entry) instead of overwriting either.

import { useNavigation, usePreventRemove, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Blocks from "../../components/Blocks";
import { Button, IconButton, Notice, Segmented, Txt } from "../../components/ui";
import { toAppHref } from "../../navigation/hrefs";
import {
  NOTE_MARKDOWN_MAX,
  RevisionConflictError,
  dateFromKey,
  formatDayHeading,
  localDateKey,
  markdownExcerpt,
  newRequestId,
  normalizeScriptureVolume,
  scriptureCatalog,
  scriptureSource,
  sourceKindLabel,
  type NoteSource,
} from "../../shared/web";
import type { NoteSync } from "../../storage/accountStudy";
import { journalStudy, type EditableNote } from "../../storage/journalData";
import { assertStudyIdentity, useStudyIdentity, type StudyMode } from "../../storage/studySession";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import type { DraftIntent } from "./draftIntent";
import { markdownBlocks } from "./markdown";

function chapterVerseCount(source: NoteSource): number | undefined {
  if (source.kind !== "scripture" || !source.volume || !source.book || !source.chapter) return undefined;
  return scriptureCatalog.getBook(normalizeScriptureVolume(source.volume), source.book)?.verseCounts[source.chapter - 1];
}

function shiftDay(key: string, delta: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + delta);
  return localDateKey(date);
}

function withRange(source: NoteSource, range: { start: number; end: number } | null): NoteSource {
  if (source.kind !== "scripture" || !source.volume || !source.book || !source.chapter) return source;
  const label = source.label.replace(/:[\d–,\s-]+$/, "");
  return scriptureSource({
    volume: source.volume,
    book: source.book,
    chapter: source.chapter,
    verseStart: range?.start,
    verseEnd: range?.end,
    reference: range ? `${label}:${range.start === range.end ? range.start : `${range.start}–${range.end}`}` : label,
  });
}

function ReadingChip({
  source,
  reading,
  onReading,
  date,
  onDate,
  range,
  onRange,
  verseCount,
  onRemoveSource,
  dateEditable,
}: {
  source: NoteSource;
  reading: boolean;
  onReading: (value: boolean) => void;
  date: string;
  onDate: (date: string) => void;
  range: { start: number; end: number } | null;
  onRange: (range: { start: number; end: number } | null) => void;
  verseCount?: number;
  onRemoveSource?: () => void;
  dateEditable: boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const scripture = source.kind === "scripture" && !!source.chapter;
  return (
    <View style={{ gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: reading ? colors.accentMint : colors.surfaceCard }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: colors.foregroundSoft }}>{sourceKindLabel(source)}</Text>
          <Text
            accessibilityRole="link"
            accessibilityHint="Opens the passage"
            onPress={() => router.push(toAppHref(source.href) as never)}
            style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.foreground, textDecorationLine: "underline", textDecorationColor: colors.accentRubricLine }}
          >
            {source.label}
          </Text>
        </View>
        {onRemoveSource ? <IconButton icon="xmark" label={`Remove ${source.label} from this entry`} onPress={onRemoveSource} /> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: colors.foreground }}>Log reading</Text>
        <Switch accessibilityLabel={`Log reading of ${source.label}`} value={reading} onValueChange={onReading} trackColor={{ true: colors.readerRead, false: colors.surfaceBorder }} thumbColor={colors.background} />
      </View>
      {reading && scripture && verseCount ? (
        <View style={{ gap: 8 }}>
          <Segmented
            label="Reading range"
            value={range ? "verses" : "chapter"}
            onChange={(value) => onRange(value === "chapter" ? null : { start: source.verseStart ?? 1, end: source.verseEnd ?? source.verseStart ?? verseCount })}
            options={[
              { value: "chapter", label: "Whole chapter" },
              { value: "verses", label: "Verses" },
            ]}
          />
          {range ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
              <Txt>From</Txt>
              <IconButton icon="minus" label="Earlier first verse" disabled={range.start <= 1} onPress={() => onRange({ ...range, start: range.start - 1 })} />
              <Txt accessibilityLabel={`First verse ${range.start}`} style={{ fontFamily: fonts.sansBold, minWidth: 24, textAlign: "center" }}>{range.start}</Txt>
              <IconButton icon="plus" label="Later first verse" disabled={range.start >= range.end} onPress={() => onRange({ ...range, start: range.start + 1 })} />
              <Txt>to</Txt>
              <IconButton icon="minus" label="Earlier last verse" disabled={range.end <= range.start} onPress={() => onRange({ ...range, end: range.end - 1 })} />
              <Txt accessibilityLabel={`Last verse ${range.end}`} style={{ fontFamily: fonts.sansBold, minWidth: 24, textAlign: "center" }}>{range.end}</Txt>
              <IconButton icon="plus" label="Later last verse" disabled={range.end >= verseCount} onPress={() => onRange({ ...range, end: range.end + 1 })} />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.foregroundMuted }}>{formatDayHeading(date)}</Text>
        {dateEditable ? (
          <>
            <IconButton icon="chevron-left" label="Previous day" onPress={() => onDate(shiftDay(date, -1))} />
            <IconButton icon="chevron-right" label="Next day" disabled={date >= localDateKey()} onPress={() => onDate(shiftDay(date, 1))} />
          </>
        ) : null}
      </View>
    </View>
  );
}

type Props =
  | { mode: "new"; intent: DraftIntent }
  | { mode: "edit"; note: EditableNote; study: StudyMode; sync: NoteSync | null; deleting: boolean };

function SyncLine({ sync }: { sync: NoteSync }) {
  const { colors } = useTheme();
  const text =
    sync.state === "synced" ? "Synced to your account" : sync.state === "sending" ? "Saved on this device · syncing…" : sync.state === "pending" ? "Saved on this device · waiting to sync" : null;
  if (!text) return null;
  return (
    <Text accessibilityLiveRegion="polite" testID="entry-sync" style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: sync.state === "synced" ? colors.readerRead : colors.foregroundSoft }}>
      {text}
    </Text>
  );
}

/** A change that met a newer one in the account: nothing is overwritten until the owner chooses. */
function ConflictPanel({ sync, onResolved }: { sync: Extract<NoteSync, { state: "conflict" }>; onResolved: (newId: string | null) => void }) {
  const { conflict } = sync;
  const choose = (choice: "keepMine" | "useTheirs" | "saveAsNew") => onResolved(journalStudy.resolve(sync.opId, choice));
  const newer = conflict.kind === "revision" && conflict.serverText !== null ? markdownExcerpt(conflict.serverText) : null;
  const message =
    conflict.kind === "missing"
      ? "This entry was deleted from your account on the website or another device. Your version is still here."
      : conflict.kind === "entry"
        ? "This entry was changed somewhere else before it finished saving here. Your version is still here; nothing was overwritten."
        : "This entry was changed on the website or another device after you edited it here. Your version is still here; nothing was overwritten.";
  return (
    <View accessibilityRole="alert" style={{ gap: 10 }} testID="entry-conflict">
      <Notice tone="warning">{newer ? `${message} The newer version begins: “${newer}”` : message}</Notice>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {conflict.kind === "revision" && conflict.serverRevision !== null ? <Button variant="secondary" label="Keep my version" onPress={() => choose("keepMine")} testID="conflict-keep" /> : null}
        {conflict.kind !== "missing" ? (
          <Button variant="secondary" label={conflict.kind === "entry" ? "Open the saved entry" : "Use the newer version"} onPress={() => choose("useTheirs")} testID="conflict-theirs" />
        ) : (
          <Button variant="secondary" label="Discard my version" onPress={() => choose("useTheirs")} testID="conflict-discard" />
        )}
        {sync.text?.trim() || conflict.kind === "entry" ? <Button variant="secondary" label="Save mine as a new entry" onPress={() => choose("saveAsNew")} testID="conflict-new" /> : null}
      </View>
    </View>
  );
}

export default function EntryEditor(props: Props) {
  const identity = useStudyIdentity();
  const [openedIdentity] = useState(identity);
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const initial = props.mode === "new" ? props.intent : null;
  const note = props.mode === "edit" ? props.note : null;
  const account = props.mode === "edit" ? props.study === "account" : false;
  const requestId = useRef(newRequestId());
  const [text, setText] = useState(note?.markdown_body ?? initial?.body ?? "");
  const [source, setSource] = useState<NoteSource | null>(note?.source ?? initial?.source ?? null);
  const [reading, setReading] = useState(note ? !!note.reading_at : !!initial?.reading);
  const [date, setDate] = useState(note?.journal_date ?? initial?.journalDate ?? localDateKey());
  const [range, setRange] = useState<{ start: number; end: number } | null>(
    source?.verseStart ? { start: source.verseStart, end: source.verseEnd ?? source.verseStart } : null
  );
  const [view, setView] = useState<"write" | "preview">("write");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [revision, setRevision] = useState(note?.revision ?? 0);
  const [savedText, setSavedText] = useState(note?.markdown_body ?? "");
  const [savedReading, setSavedReading] = useState(note ? JSON.stringify([!!note.reading_at, note.source, note.journal_date]) : "");
  const preview = useMemo(() => (view === "preview" ? markdownBlocks(text) : []), [view, text]);

  const readingKey = JSON.stringify([reading, reading && source ? withRange(source, range) : note?.source ?? source, date]);
  const dirty = props.mode === "new" ? text.trim().length > 0 || (!!initial?.source && reading) : text !== savedText || readingKey !== savedReading;

  // The note as stored changed (a sync finished, the website edited it, a conflict was settled). Text this editor
  // knows is saved takes the stored revision as its base; an editor with nothing unsaved shows the stored note.
  const incomingReading = note ? JSON.stringify([!!note.reading_at, note.source, note.journal_date]) : "";
  useEffect(() => {
    if (!note) return;
    if (note.markdown_body === savedText) {
      if (note.revision !== revision) setRevision(note.revision);
      if (!dirty && incomingReading !== savedReading) {
        setReading(!!note.reading_at);
        setSource(note.source ?? null);
        setDate(note.journal_date);
        setRange(note.source?.verseStart ? { start: note.source.verseStart, end: note.source.verseEnd ?? note.source.verseStart } : null);
        setSavedReading(incomingReading);
      }
      return;
    }
    if (dirty) return;
    setText(note.markdown_body);
    setSavedText(note.markdown_body);
    setRevision(note.revision);
    setReading(!!note.reading_at);
    setSource(note.source ?? null);
    setDate(note.journal_date);
    setRange(note.source?.verseStart ? { start: note.source.verseStart, end: note.source.verseEnd ?? note.source.verseStart } : null);
    setSavedReading(incomingReading);
    // Only the stored note's changes drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.markdown_body, note?.revision, incomingReading]);
  const changedElsewhere = !!note && dirty && note.markdown_body !== savedText;

  // Leaving on purpose (after Save or Delete, or a confirmed discard) first lifts the guard, then navigates once
  // that render has committed; navigating while the guard is still up would only re-trigger it.
  const [leave, setLeave] = useState<{ run: () => void } | null>(null);
  useEffect(() => {
    leave?.run();
  }, [leave]);

  usePreventRemove(dirty && !leave, ({ data }) => {
    Alert.alert("Discard changes?", props.mode === "new" ? "This entry hasn't been saved." : "Your changes to this entry haven't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => setLeave({ run: () => navigation.dispatch(data.action) }) },
    ]);
  });

  useEffect(() => setStatus(null), [text, reading, range, date]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/notes"));

  const saveNew = () => {
    const finalSource = source ? withRange(source, reading ? range : null) : null;
    if (!text.trim() && !(reading && finalSource)) {
      setError("Write a note or log reading before saving.");
      return;
    }
    if (text.length > NOTE_MARKDOWN_MAX) {
      setError("This note is too long.");
      return;
    }
    try {
      assertStudyIdentity(openedIdentity);
      const { id } = journalStudy.create({
        requestId: requestId.current,
        markdownBody: text,
        journalDate: date,
        source: finalSource ?? null,
        logReading: reading && !!finalSource,
      });
      setError(null);
      setLeave({ run: () => router.replace(`/notes/entry/${encodeURIComponent(id)}` as never) });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Couldn't save on this device.");
    }
  };

  const saveEdit = () => {
    if (!note) return;
    try {
      assertStudyIdentity(openedIdentity);
      if (text !== savedText) {
        const result = journalStudy.save(note.id, text, revision);
        if (result.revision !== null) setRevision(result.revision);
        setSavedText(text);
      }
      if (readingKey !== savedReading) {
        const finalSource = source ? withRange(source, reading ? range : null) : null;
        journalStudy.setReading(note.id, reading && finalSource ? { source: finalSource, journalDate: date } : null, text);
        setSavedReading(readingKey);
      }
      setError(null);
      setStatus(account ? null : "Saved on this device");
    } catch (problem) {
      if (problem instanceof RevisionConflictError) {
        setError("This entry changed since you opened it. Copy your text, then reopen the entry to see the latest version.");
      } else setError(problem instanceof Error ? problem.message : "Couldn't save on this device.");
    }
  };

  const resolved = (newId: string | null) => {
    if (newId) setLeave({ run: () => router.replace(`/notes/entry/${encodeURIComponent(newId)}` as never) });
  };

  const remove = () => {
    if (!note) return;
    Alert.alert("Delete this entry?", account ? "It will be deleted from your account, on the website too. This can't be undone." : "It will be removed from this device. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete entry",
        style: "destructive",
        onPress: () =>
          setLeave({
            run: () => {
              try {
                assertStudyIdentity(openedIdentity);
                journalStudy.remove(note.id);
                close();
              } catch (problem) {
                setLeave(null);
                setError(problem instanceof Error ? problem.message : "Couldn't delete on this device.");
              }
            },
          }),
      },
    ]);
  };

  if (identity !== openedIdentity) return (
    <View style={{ padding: 24, gap: 12 }}>
      <Notice tone="warning">Your account changed. Close and reopen this editor to use the current study. Nothing from this editor was transferred.</Notice>
      <Button label="Close editor" onPress={() => setLeave({ run: close })} />
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: Math.max(insets.top, 12) + 4, paddingHorizontal: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 6, borderBottomWidth: 1, borderBottomColor: colors.rule }}>
        <IconButton icon="xmark" label={props.mode === "new" ? "Close new entry" : "Close entry"} onPress={close} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, fontFamily: fonts.serif, fontSize: 20, color: colors.foreground }}>
          {props.mode === "new" ? "New entry" : note?.title || "Untitled note"}
        </Text>
        <Button label={props.mode === "new" ? "Save entry" : "Save"} onPress={props.mode === "new" ? saveNew : saveEdit} disabled={props.mode === "edit" && !dirty} testID="save-entry" />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40, width: "100%", maxWidth: 760, alignSelf: "center" }}>
        {source ? (
          <ReadingChip
            source={reading ? withRange(source, range) : source}
            reading={reading}
            onReading={(value) => {
              if (!value && props.mode === "edit" && !text.trim()) {
                setError("Add a note before removing the reading.");
                return;
              }
              setReading(value);
            }}
            date={date}
            onDate={setDate}
            range={range}
            onRange={setRange}
            verseCount={initial?.verseCount ?? chapterVerseCount(source)}
            onRemoveSource={props.mode === "new" ? () => setSource(null) : undefined}
            dateEditable={props.mode === "new" || reading}
          />
        ) : (
          <Txt style={{ fontSize: 13, color: colors.foregroundSoft }}>{`Personal note · ${formatDayHeading(date)}`}</Txt>
        )}
        {initial?.prompt ? <Text style={{ fontFamily: fonts.serif, fontStyle: "italic", fontSize: 17, lineHeight: 25, color: colors.foregroundMuted }}>{initial.prompt}</Text> : null}
        <Segmented
          label="Writer view"
          value={view}
          onChange={setView}
          options={[
            { value: "write", label: "Write" },
            { value: "preview", label: "Preview" },
          ]}
        />
        {view === "write" ? (
          <TextInput
            testID="entry-text"
            accessibilityLabel="Note text (Markdown)"
            value={text}
            onChangeText={setText}
            multiline
            autoFocus={props.mode === "new" && !initial?.body}
            placeholder="Write in Markdown: # heading, **bold**, *italic*, - lists, > quotes"
            placeholderTextColor={colors.foregroundSoft}
            textAlignVertical="top"
            style={{
              minHeight: 260,
              padding: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.surfaceBorder,
              backgroundColor: colors.inputSurface,
              color: colors.foreground,
              fontFamily: fonts.sans,
              fontSize: 16,
              lineHeight: 24,
            }}
          />
        ) : (
          <View style={{ minHeight: 260, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surfaceCard }}>
            {preview.length ? (
              <Blocks blocks={preview} size={16} onPath={(path) => router.push(path as never)} />
            ) : (
              <Txt style={{ color: colors.foregroundSoft }}>Nothing written yet.</Txt>
            )}
          </View>
        )}
        {error ? <Notice tone="warning">{error}</Notice> : null}
        {props.mode === "edit" && props.sync?.state === "conflict" ? <ConflictPanel sync={props.sync} onResolved={resolved} /> : null}
        {props.mode === "edit" && props.sync?.state === "error" ? (
          <View accessibilityRole="alert" style={{ gap: 8 }}>
            <Notice tone="warning">{props.sync.error}</Notice>
            <Button variant="secondary" icon="rotate" label="Try sync again" style={{ alignSelf: "flex-start" }} onPress={() => journalStudy.retry()} />
          </View>
        ) : null}
        {changedElsewhere && account && props.mode === "edit" && props.sync?.state !== "conflict" ? (
          <Notice tone="warning">This entry was changed on the website or another device while you were editing. If you save, you’ll be asked which version to keep.</Notice>
        ) : null}
        {props.mode === "edit" && props.sync && !dirty && props.sync.state !== "conflict" && props.sync.state !== "error" ? <SyncLine sync={props.sync} /> : null}
        {status ? (
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.readerRead }}>
            {status}
          </Text>
        ) : null}
        {props.mode === "edit" ? (
          <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.rule, gap: 8 }}>
            <Txt style={{ fontSize: 12, color: colors.foregroundSoft }}>
              {`Created ${new Date(note!.created_at).toLocaleString()} · ${account ? "In your account" : "Saved on this device"}`}
            </Txt>
            <Button variant="danger" icon="trash" label={props.deleting ? "Deleting…" : "Delete entry"} disabled={props.deleting} style={{ alignSelf: "flex-start" }} onPress={remove} testID="delete-entry" />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
