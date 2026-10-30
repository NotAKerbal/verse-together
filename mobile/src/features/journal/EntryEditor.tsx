// A journal entry's editor (JournalEntryComposer.tsx and JournalNoteEditor.tsx): an optional reading chip naming
// the passage or lesson (with Whole chapter / Verses and the day), the Markdown writer with a preview, and Save
// entry. An entry with neither note nor reading is refused.
//
// A new entry is one draft per study owner, kept on this device as it is written (entryDraftStore.ts): leaving can
// keep it for later, and a draft the app was closed on comes back the next time a new entry is opened, for the same
// owner only. Saving it makes one entry under the draft's request id, so a second Save (or a retry after the app
// stopped mid-save) never makes a duplicate. Nothing is written for a session whose owner isn't known yet.
//
// A saved entry saves itself as it is edited (JournalNoteEditor's outbox): a pause in typing, leaving the field, the
// app going to the background, or leaving the screen saves the text against the revision it was written on. A change
// made elsewhere is reported, never overwritten: on this device the editor stops with the text kept and offers to
// load the latest version or save this one over it; signed in, the entry is the account's (journalData.ts), kept on
// the device at once and sent when connected, and a newer version on the website offers the choice (keep mine, use
// the newer version, or save mine as a new entry). A save that fails says so, keeps the text, and can be retried.

import * as Clipboard from "expo-clipboard";
import { useNavigation, usePreventRemove, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Blocks from "../../components/Blocks";
import { Button, Icon, IconButton, Notice, Segmented, Txt } from "../../components/ui";
import { toAppHref } from "../../navigation/hrefs";
import {
  NOTE_MARKDOWN_MAX,
  RevisionConflictError,
  dateFromKey,
  formatDayHeading,
  formatShortDayHeading,
  formatTime,
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
import { assertStudyIdentity, getStudyIdentity, useStudyIdentity, type StudyMode } from "../../storage/studySession";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import type { DraftIntent } from "./draftIntent";
import {
  clearEntryDraft,
  draftOwner,
  isRecoverable,
  readEntryDraft,
  savedEntryFor,
  writeEntryDraft,
  type EntryDraftFields,
  type EntryRange,
  type StoredEntryDraft,
} from "./entryDraftStore";
import { canDelete, isReadOnly, useNoteEditing, type NoteStatus } from "./noteStatus";
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
  const [expanded, setExpanded] = useState(false);
  const verseLabel = range
    ? range.start === range.end ? `Verse ${range.start}` : `Verses ${range.start}–${range.end}`
    : "Whole chapter";
  const rangeLabel = scripture ? verseLabel : "Reading logged";
  const summary = `${reading ? rangeLabel : "Not logged"} · ${formatShortDayHeading(date)}`;
  return (
    <View style={{ gap: 0, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: reading ? colors.accentMint : colors.surfaceCard }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={source.label}
          accessibilityHint="Opens the passage"
          onPress={() => router.push(toAppHref(source.href) as never)}
          style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ fontFamily: fonts.serif, fontSize: 17, color: colors.foreground, textDecorationLine: "underline", textDecorationColor: colors.accentRubricLine }}>
            {source.label}
          </Text>
        </Pressable>
        <Switch accessibilityLabel={`Log reading of ${source.label}`} value={reading} onValueChange={onReading} trackColor={{ true: colors.readerRead, false: colors.surfaceBorder }} thumbColor={colors.background} />
        {onRemoveSource ? <IconButton icon="xmark" label={`Remove ${source.label} from this entry`} onPress={onRemoveSource} /> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit reading details"
        accessibilityState={{ expanded }}
        accessibilityValue={{ text: summary }}
        onPress={() => setExpanded((value) => !value)}
        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.foregroundMuted }}>
          {summary}
        </Text>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={12} color={colors.foregroundMuted} />
      </Pressable>
      {expanded ? (
        <View style={{ gap: 8, paddingBottom: 4 }}>
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
      ) : null}
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

/** A pause in typing this long saves an entry being edited (the web's outbox waits the same). */
const AUTOSAVE_MS = 900;
/** A pause this long keeps a new entry's draft on the device. */
const DRAFT_KEEP_MS = 400;

const DRAFT_NOT_KEPT = "This draft couldn't be kept on this device. Save it as an entry, or copy your text, before leaving.";
/** Only one unsaved entry is kept per study: this one waits while the earlier one does. */
const DRAFT_WAITING =
  "This entry isn’t kept on this device until you continue or discard the earlier one above. Save it as an entry, or copy your text, before leaving.";

/** An edit's save on this device (signed in, the account's sync state says the rest). */
type EditSave = { kind: "idle" } | { kind: "saved"; at: string } | { kind: "error"; message: string } | { kind: "conflict"; revision: number };

/**
 * A draft found for this owner when a new entry opened: "restored" is being shown in the editor; "waiting" was left
 * where it is because the editor opened with something of its own, until the person chooses.
 */
type Recovery = { kind: "restored" | "waiting"; draft: StoredEntryDraft };

function rangeOf(source: NoteSource | null | undefined): EntryRange | null {
  return source?.verseStart ? { start: source.verseStart, end: source.verseEnd ?? source.verseStart } : null;
}

/**
 * What an entry's reading saves, for telling whether it changed: whether it is logged, which passage or lesson (not
 * how its label is written: the website's "1 Nephi 3:7-9" and this app's "1 Nephi 3:7–9" are the same reading), the
 * verses read, and the day. Opening an entry unchanged never counts as a change, so it is never saved again.
 */
function readingKeyOf(reading: boolean, source: NoteSource | null | undefined, range: EntryRange | null, date: string): string {
  const where = !source
    ? null
    : source.kind === "scripture" && source.volume && source.book && source.chapter
      ? [source.kind, source.volume, source.book, source.chapter]
      : [source.kind, source.href, source.label];
  return JSON.stringify([reading, where, reading ? range : null, date]);
}

/**
 * The source an entry saves: logged with other verses than its own, it names the verses chosen; otherwise it is the
 * source exactly as it came (its own label and link, the website's included).
 */
function savedSource(source: NoteSource | null, reading: boolean, range: EntryRange | null): NoteSource | null {
  if (!source || !reading) return source;
  const own = rangeOf(source);
  return own?.start === range?.start && own?.end === range?.end ? source : withRange(source, range);
}

function storedReadingKey(note: EditableNote): string {
  return readingKeyOf(!!note.reading_at, note.source, rangeOf(note.source), note.journal_date);
}

function fieldsFromIntent(intent: DraftIntent): EntryDraftFields {
  return {
    requestId: newRequestId(),
    text: intent.body,
    source: intent.source,
    reading: !!intent.reading,
    journalDate: intent.journalDate ?? localDateKey(),
    range: rangeOf(intent.source),
    edited: false,
    prompt: intent.prompt,
    verseCount: intent.verseCount,
  };
}

function fieldsFromStored(stored: StoredEntryDraft, intent?: DraftIntent): EntryDraftFields {
  const { version: _version, updatedAt: _updatedAt, ...fields } = stored;
  return { ...fields, prompt: fields.prompt ?? intent?.prompt };
}

/** The fields a new entry opens with, and the owner's earlier draft if there is one to offer. */
function startNewEntry(intent: DraftIntent, owner: string | null): { fields: EntryDraftFields; recovery: Recovery | null } {
  const fresh = fieldsFromIntent(intent);
  let stored = readEntryDraft(owner);
  // Saved just before the app stopped (its entry exists), or holding nothing to lose: not offered again.
  if (stored && (!isRecoverable(stored) || savedEntryFor(stored.requestId))) {
    clearEntryDraft(owner);
    stored = null;
  }
  if (!stored) return { fields: fresh, recovery: null };
  // A blank new entry continues the draft, as the web's composer keeps its own; one opened with something of its
  // own (a quote, a reading to log) shows that, and asks about the draft rather than replacing either.
  if (!intent.source && !intent.body.trim()) return { fields: fieldsFromStored(stored, intent), recovery: { kind: "restored", draft: stored } };
  return { fields: fresh, recovery: { kind: "waiting", draft: stored } };
}

function draftWhen(draft: StoredEntryDraft) {
  return `${formatDayHeading(localDateKey(new Date(draft.updatedAt)))}, ${formatTime(draft.updatedAt)}`;
}

function RecoveryNotice({ recovery, onContinue, onDiscard }: { recovery: Recovery; onContinue: () => void; onDiscard: () => void }) {
  const { draft } = recovery;
  const what = markdownExcerpt(draft.text) || draft.source?.label || "a reading";
  return (
    <View accessibilityRole="alert" style={{ gap: 8 }} testID="entry-recovery">
      <Notice>
        {recovery.kind === "restored"
          ? `This is the entry you hadn’t saved yet, from ${draftWhen(draft)}.`
          : `You have an entry you hadn’t saved yet, from ${draftWhen(draft)}: “${what}”`}
      </Notice>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {recovery.kind === "waiting" ? <Button variant="secondary" label="Continue that entry" onPress={onContinue} testID="recovery-continue" /> : null}
        <Button variant="secondary" label={recovery.kind === "restored" ? "Discard it and start over" : "Discard that entry"} onPress={onDiscard} testID="recovery-discard" />
      </View>
    </View>
  );
}

/** A published or archived entry, as the website shows it: its text, and where it came from. */
function ReadOnlyEntry({
  note,
  status,
  unsaved,
  onCopy,
  copyNotice,
}: {
  note: EditableNote;
  status: NoteStatus;
  /** Text typed here before the entry stopped being a draft (it can't be saved), or null. */
  unsaved: string | null;
  onCopy: () => void;
  copyNotice: string | null;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const blocks = useMemo(() => markdownBlocks(note.markdown_body), [note.markdown_body]);
  const source = note.source;
  return (
    <View style={{ gap: 12 }} testID="entry-read-only">
      <Text style={{ alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.accentMint, fontFamily: fonts.sansBold, fontSize: 12, color: colors.foreground }}>
        {status === "published" ? "Published · read-only" : "Archived · read-only"}
      </Text>
      <Txt style={{ fontSize: 13, color: colors.foregroundSoft }}>
        {`${note.reading_at && source ? `${sourceKindLabel(source)} read` : "Personal note"} · ${formatDayHeading(note.journal_date)}`}
      </Txt>
      {source ? (
        <Text
          accessibilityRole="link"
          accessibilityHint="Opens the passage"
          onPress={() => router.push(toAppHref(source.href) as never)}
          style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.foreground, textDecorationLine: "underline", textDecorationColor: colors.accentRubricLine }}
        >
          {source.label}
        </Text>
      ) : null}
      {unsaved !== null ? (
        <View accessibilityRole="alert" style={{ gap: 8 }}>
          <Notice tone="warning">This entry was published or archived elsewhere, so it can no longer be edited and your changes weren’t saved. Copy them to keep them.</Notice>
          <Button variant="secondary" label="Copy my text" onPress={onCopy} style={{ alignSelf: "flex-start" }} testID="read-only-copy" />
          {copyNotice ? <Txt accessibilityLiveRegion="polite">{copyNotice}</Txt> : null}
        </View>
      ) : null}
      <View style={{ minHeight: 120, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surfaceCard }}>
        {blocks.length ? <Blocks blocks={blocks} size={16} onPath={(path) => router.push(path as never)} /> : <Txt style={{ color: colors.foregroundSoft }}>This note is empty.</Txt>}
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
  const note = props.mode === "edit" ? props.note : null;
  const account = props.mode === "edit" ? props.study === "account" : false;
  // A new entry's owner is fixed when it opens: its draft is only ever kept for them.
  const [owner] = useState(() => (props.mode === "new" ? draftOwner() : null));
  const [start] = useState(() => (props.mode === "new" ? startNewEntry(props.intent, owner) : null));
  const [recovery, setRecovery] = useState<Recovery | null>(start?.recovery ?? null);
  const [requestId, setRequestId] = useState(start?.fields.requestId ?? "");
  const [prompt, setPrompt] = useState(start?.fields.prompt);
  const [verseCountHint, setVerseCountHint] = useState(start?.fields.verseCount);
  const [edited, setEdited] = useState(start?.fields.edited ?? false);
  const [text, setText] = useState(note?.markdown_body ?? start?.fields.text ?? "");
  const [source, setSource] = useState<NoteSource | null>(note?.source ?? start?.fields.source ?? null);
  const [reading, setReading] = useState(note ? !!note.reading_at : !!start?.fields.reading);
  const [date, setDate] = useState(note?.journal_date ?? start?.fields.journalDate ?? localDateKey());
  const [range, setRange] = useState<EntryRange | null>(note ? rangeOf(note.source) : (start?.fields.range ?? null));
  const [view, setView] = useState<"write" | "preview">("write");
  const [error, setError] = useState<string | null>(null);
  // A new entry's Save that didn't save (it is offered again as Try again, under the same request id).
  const [failed, setFailed] = useState(false);
  const [draftProblem, setDraftProblem] = useState<string | null>(null);
  const [editSave, setEditSave] = useState<EditSave>({ kind: "idle" });
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(note?.revision ?? 0);
  const [savedText, setSavedText] = useState(note?.markdown_body ?? "");
  const [savedReading, setSavedReading] = useState(note ? storedReadingKey(note) : "");
  const preview = useMemo(() => (view === "preview" ? markdownBlocks(text) : []), [view, text]);

  const readingKey = readingKeyOf(reading, source, range, date);
  const dirty = props.mode === "new" ? text.trim().length > 0 || (!!source && reading) : text !== savedText || readingKey !== savedReading;

  // The note as stored changed (a sync finished, the website edited it, a conflict was settled). Text this editor
  // knows is saved takes the stored revision as its base; an editor with nothing unsaved shows the stored note.
  const incomingReading = note ? storedReadingKey(note) : "";
  useEffect(() => {
    if (!note) return;
    if (note.markdown_body === savedText) {
      if (note.revision !== revision) setRevision(note.revision);
      if (!dirty && incomingReading !== savedReading) {
        setReading(!!note.reading_at);
        setSource(note.source ?? null);
        setDate(note.journal_date);
        setRange(rangeOf(note.source));
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
    setRange(rangeOf(note.source));
    setSavedReading(incomingReading);
    // Only the stored note's changes drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.markdown_body, note?.revision, incomingReading]);
  const changedElsewhere = !!note && dirty && note.markdown_body !== savedText;
  const identityChanged = identity !== openedIdentity;
  // Only a draft can be edited (convex/insights.ts): a published or archived entry is shown read-only, and nothing
  // is saved or queued for it, even text typed before it was published elsewhere.
  const editing = useNoteEditing(note?.id ?? null);
  const readOnly = props.mode === "edit" && isReadOnly(editing);
  const deletable = props.mode === "edit" && canDelete(editing);
  // Saving by itself waits while a newer version is waiting to be looked at, or the entry is going away.
  const autosavePaused = changedElsewhere || readOnly || editSave.kind === "conflict" || (props.mode === "edit" && props.deleting) || identityChanged;

  // What the saves below read when they run (from a timer, the app going to the background, or unmounting), not
  // what they were scheduled with. A save updates it at once, so a second save in the same moment sends nothing.
  const latest = useRef({ text, savedText, revision, readingKey, savedReading, reading, source, range, date, autosavePaused, readOnly });
  latest.current = { text, savedText, revision, readingKey, savedReading, reading, source, range, date, autosavePaused, readOnly };
  // Deleted, discarded, or otherwise left on purpose: nothing more is saved from this editor.
  const doneRef = useRef(false);

  /** Saves the entry being edited. `auto` saves wait while a newer version needs a choice. True once nothing is unsaved. */
  const flushEdit = (mode: "auto" | "explicit"): boolean => {
    if (props.mode !== "edit" || !note || doneRef.current) return true;
    const state = latest.current;
    if (state.text === state.savedText && state.readingKey === state.savedReading) return true;
    if (state.readOnly || getStudyIdentity() !== openedIdentity || (mode === "auto" && state.autosavePaused)) return false;
    try {
      assertStudyIdentity(openedIdentity);
      if (state.text !== state.savedText) {
        const result = journalStudy.save(note.id, state.text, state.revision);
        if (result.revision !== null) {
          state.revision = result.revision;
          setRevision(result.revision);
        }
        state.savedText = state.text;
        setSavedText(state.text);
      }
      if (state.readingKey !== state.savedReading) {
        // As for a new entry: only the reading-range controls replace the source's own verse range.
        const finalSource = savedSource(state.source, state.reading, state.range);
        journalStudy.setReading(note.id, state.reading && finalSource ? { source: finalSource, journalDate: state.date } : null, state.text);
        state.savedReading = state.readingKey;
        setSavedReading(state.readingKey);
      }
      setEditSave(account ? { kind: "idle" } : { kind: "saved", at: new Date().toISOString() });
      return true;
    } catch (problem) {
      if (problem instanceof RevisionConflictError) setEditSave({ kind: "conflict", revision: problem.currentRevision ?? note.revision });
      else setEditSave({ kind: "error", message: problem instanceof Error && problem.message ? problem.message : "Couldn't save on this device." });
      return false;
    }
  };

  const draftFields: EntryDraftFields = { requestId, text, source, reading, journalDate: date, range, edited, prompt, verseCount: verseCountHint };
  const draftRef = useRef({ fields: draftFields, recovery });
  draftRef.current = { fields: draftFields, recovery };

  /** Keeps the new entry's draft for its owner. False when it couldn't be kept. */
  const persistDraft = (): boolean => {
    if (props.mode !== "new" || !owner || doneRef.current) return true;
    // An earlier draft is waiting for the person's choice: nothing replaces it until then.
    if (draftRef.current.recovery?.kind === "waiting") return true;
    if (getStudyIdentity() !== openedIdentity) return false;
    try {
      writeEntryDraft(owner, draftRef.current.fields);
      setDraftProblem(null);
      return true;
    } catch {
      setDraftProblem(DRAFT_NOT_KEPT);
      return false;
    }
  };

  const saves = useRef({ flushEdit, persistDraft });
  saves.current = { flushEdit, persistDraft };

  // A pause in typing saves an edit; a shorter one keeps a new entry's draft.
  useEffect(() => {
    if (props.mode !== "edit" || !dirty || autosavePaused) return;
    const timer = setTimeout(() => saves.current.flushEdit("auto"), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [props.mode, dirty, autosavePaused, text, readingKey]);
  const draftKey = props.mode === "new" ? JSON.stringify(draftFields) : "";
  useEffect(() => {
    if (props.mode !== "new") return;
    const timer = setTimeout(() => saves.current.persistDraft(), DRAFT_KEEP_MS);
    return () => clearTimeout(timer);
  }, [props.mode, draftKey, recovery]);

  // The app going to the background (where Android may end it) saves at once, and so does closing the editor.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") return;
      saves.current.flushEdit("auto");
      saves.current.persistDraft();
    });
    return () => {
      subscription.remove();
      saves.current.flushEdit("auto");
      saves.current.persistDraft();
    };
  }, []);

  // Leaving on purpose (after Save or Delete, or a confirmed discard) first lifts the guard, then navigates once
  // that render has committed; navigating while the guard is still up would only re-trigger it.
  const [leave, setLeave] = useState<{ run: () => void } | null>(null);
  useEffect(() => {
    leave?.run();
  }, [leave]);

  usePreventRemove(dirty && !leave, ({ data }) => {
    const go = () => setLeave({ run: () => navigation.dispatch(data.action) });
    if (props.mode === "edit") {
      // Leaving saves what was typed; only a save that can't be made (or a newer version to look at first) asks.
      if (!changedElsewhere && !readOnly && flushEdit("explicit")) return go();
      Alert.alert(
        "Discard changes?",
        readOnly
          ? "This entry was published or archived, so it can't be edited and your changes haven't been saved."
          : changedElsewhere
            ? "This entry was changed somewhere else while you were editing, so your changes haven't been saved."
            : "Your changes to this entry couldn't be saved.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              doneRef.current = true;
              go();
            },
          },
        ],
      );
      return;
    }
    const waiting = recovery?.kind === "waiting";
    // Keep draft only when keeping it would keep something (a reading opened to log, untouched, is not kept).
    const keepable = !!owner && !waiting && isRecoverable(draftRef.current.fields);
    const message = keepable
      ? "This entry hasn't been saved. Keep it as a draft to finish later on this device, or discard it."
      : waiting && text.trim()
        ? "This entry hasn't been saved, and it can't be kept as a draft while your earlier one is waiting. Copy your text to keep it."
        : "This entry hasn't been saved.";
    Alert.alert("Discard changes?", message, [
      { text: "Keep editing", style: "cancel" },
      ...(waiting && text.trim() ? [{ text: "Copy my text", onPress: () => void copyText() }] : []),
      ...(keepable
        ? [
            {
              text: "Keep draft",
              onPress: () => {
                if (persistDraft()) {
                  doneRef.current = true;
                  go();
                }
              },
            },
          ]
        : []),
      {
        text: "Discard",
        style: "destructive" as const,
        onPress: () => {
          doneRef.current = true;
          // An earlier draft still waiting for a choice is not this one: it stays.
          if (recovery?.kind !== "waiting") clearEntryDraft(owner);
          go();
        },
      },
    ]);
  });

  const close = () => (router.canGoBack() ? router.back() : router.replace("/notes"));

  const applyFields = (fields: EntryDraftFields) => {
    setRequestId(fields.requestId);
    setText(fields.text);
    setSource(fields.source);
    setReading(fields.reading);
    setDate(fields.journalDate);
    setRange(fields.range);
    setEdited(fields.edited);
    setPrompt(fields.prompt);
    setVerseCountHint(fields.verseCount);
    setError(null);
    setFailed(false);
  };

  const continueDraft = () => {
    if (props.mode !== "new" || recovery?.kind !== "waiting") return;
    const draft = recovery.draft;
    const take = () => {
      applyFields(fieldsFromStored(draft, props.intent));
      setRecovery(null);
    };
    if (text === props.intent.body && !edited) return take();
    Alert.alert("Replace what’s here?", "What you’ve written in this entry will be replaced by the earlier one.", [
      { text: "Cancel", style: "cancel" },
      { text: "Replace", style: "destructive", onPress: take },
    ]);
  };

  const discardDraft = () => {
    if (props.mode !== "new" || !recovery) return;
    const intent = props.intent;
    const kind = recovery.kind;
    Alert.alert("Discard that entry?", "What you wrote in it will be removed from this device. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          clearEntryDraft(owner);
          if (kind === "restored") applyFields(fieldsFromIntent(intent));
          setRecovery(null);
        },
      },
    ]);
  };

  const saveNew = () => {
    // A quote's source is independent of whether the reader logs it as reading.
    // Only the reading-range controls should replace its original verse range.
    const finalSource = savedSource(source, reading, range);
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
      // The draft's request id: saving again (a second press, or after the app stopped mid-save) names this entry.
      const { id } = journalStudy.create({
        requestId,
        markdownBody: text,
        journalDate: date,
        source: finalSource ?? null,
        logReading: reading && !!finalSource,
      });
      doneRef.current = true;
      // The draft became this entry; an earlier one still waiting for a choice is kept.
      if (recovery?.kind !== "waiting") clearEntryDraft(owner);
      setError(null);
      setFailed(false);
      setLeave({ run: () => router.replace(`/notes/entry/${encodeURIComponent(id)}` as never) });
    } catch (problem) {
      setFailed(true);
      setError(problem instanceof Error ? problem.message : "Couldn't save on this device.");
      // Kept at once, under the same request id, for Try again (now or after the app was closed).
      persistDraft();
    }
  };

  const loadLatest = () => {
    if (!note) return;
    setText(note.markdown_body);
    setSavedText(note.markdown_body);
    setRevision(note.revision);
    latest.current = { ...latest.current, text: note.markdown_body, savedText: note.markdown_body, revision: note.revision };
    setEditSave({ kind: "idle" });
    setCopyNotice(null);
  };

  const keepMine = () => {
    if (editSave.kind !== "conflict") return;
    // Saved over the version that refused it, by explicit choice; a still newer one refuses it again.
    latest.current.revision = editSave.revision;
    setRevision(editSave.revision);
    setEditSave({ kind: "idle" });
    setCopyNotice(null);
    flushEdit("explicit");
  };

  const copyText = async () => {
    try {
      await Clipboard.setStringAsync(latest.current.text);
      setCopyNotice("Copied.");
    } catch {
      setCopyNotice("Couldn't copy. Select the text in the editor and copy it.");
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
                doneRef.current = true;
                journalStudy.remove(note.id);
                close();
              } catch (problem) {
                doneRef.current = false;
                setLeave(null);
                setError(problem instanceof Error ? problem.message : "Couldn't delete on this device.");
              }
            },
          }),
      },
    ]);
  };

  if (identityChanged) {
    // What was typed stays only on this screen: it can be copied before closing.
    const unsaved = dirty && !!text.trim();
    return (
      <View style={{ padding: 24, gap: 12 }}>
        <Notice tone="warning">
          {`Your account changed. Close and reopen this editor to use the current study. Nothing from this editor was transferred.${unsaved ? " Copy your text first to keep it." : ""}`}
        </Notice>
        {unsaved ? <Button variant="secondary" label="Copy my text" onPress={() => void copyText()} testID="identity-copy" /> : null}
        {unsaved && copyNotice ? <Txt accessibilityLiveRegion="polite">{copyNotice}</Txt> : null}
        <Button label="Close editor" onPress={() => setLeave({ run: close })} />
      </View>
    );
  }

  const markEdited = props.mode === "new" ? () => setEdited(true) : () => {};
  const saveLine =
    props.mode !== "edit" || editSave.kind === "error" || editSave.kind === "conflict" || changedElsewhere
      ? null
      : dirty
        ? "Unsaved changes"
        : !account && editSave.kind === "saved"
          ? `Saved on this device at ${formatTime(editSave.at)}`
          : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: Math.max(insets.top, 12) + 4, paddingHorizontal: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 6, borderBottomWidth: 1, borderBottomColor: colors.rule }}>
        <IconButton icon="xmark" label={props.mode === "new" ? "Close new entry" : "Close entry"} onPress={close} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, fontFamily: fonts.serif, fontSize: 20, color: colors.foreground }}>
          {props.mode === "new" ? "New entry" : note?.title || "Untitled note"}
        </Text>
        {readOnly ? null : (
          <Button
            label={props.mode === "new" ? (failed ? "Try again" : "Save entry") : "Save"}
            onPress={props.mode === "new" ? saveNew : () => flushEdit("explicit")}
            disabled={props.mode === "edit" && !dirty}
            testID="save-entry"
          />
        )}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40, width: "100%", maxWidth: 760, alignSelf: "center" }}>
        {recovery ? <RecoveryNotice recovery={recovery} onContinue={continueDraft} onDiscard={discardDraft} /> : null}
        {readOnly && note ? (
          <ReadOnlyEntry note={note} status={editing.status} unsaved={dirty ? text : null} onCopy={() => void copyText()} copyNotice={copyNotice} />
        ) : (
          <>
          {!editing.canonical ? (
            <Txt style={{ fontSize: 13, color: colors.foregroundSoft }}>This older note is shown as text. Editing it saves it as text; its original pieces are kept.</Txt>
          ) : null}
          {source ? (
            <ReadingChip
              source={savedSource(source, reading, range)!}
              reading={reading}
              onReading={(value) => {
                if (!value && props.mode === "edit" && !text.trim()) {
                  setError("Add a note before removing the reading.");
                  return;
                }
                setReading(value);
                markEdited();
              }}
              date={date}
              onDate={(next) => {
                setDate(next);
                markEdited();
              }}
              range={range}
              onRange={(next) => {
                setRange(next);
                markEdited();
              }}
              verseCount={verseCountHint ?? chapterVerseCount(source)}
              onRemoveSource={
                props.mode === "new"
                  ? () => {
                      setSource(null);
                      markEdited();
                    }
                  : undefined
              }
              dateEditable={props.mode === "new" || reading}
            />
          ) : (
            <Txt style={{ fontSize: 13, color: colors.foregroundSoft }}>{`Personal note · ${formatDayHeading(date)}`}</Txt>
          )}
          {prompt ? <Text style={{ fontFamily: fonts.serif, fontStyle: "italic", fontSize: 17, lineHeight: 25, color: colors.foregroundMuted }}>{prompt}</Text> : null}
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
              onBlur={() => (props.mode === "edit" ? flushEdit("auto") : persistDraft())}
              multiline
              autoFocus={props.mode === "new" && !text}
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
          {draftProblem ? <Notice tone="warning">{draftProblem}</Notice> : null}
          {props.mode === "new" && recovery?.kind === "waiting" && dirty ? (
            <View accessibilityRole="alert" style={{ gap: 8 }} testID="entry-not-kept">
              <Notice tone="warning">{DRAFT_WAITING}</Notice>
              {text.trim() ? <Button variant="secondary" label="Copy my text" onPress={() => void copyText()} style={{ alignSelf: "flex-start" }} testID="waiting-copy" /> : null}
              {text.trim() && copyNotice ? <Txt accessibilityLiveRegion="polite">{copyNotice}</Txt> : null}
            </View>
          ) : null}
          {editSave.kind === "conflict" ? (
            <View accessibilityRole="alert" style={{ gap: 10 }} testID="entry-device-conflict">
              <Notice tone="warning">This entry was changed somewhere else, so your edits weren’t saved. Your text is still here: load the latest version, or save yours over it.</Notice>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button variant="secondary" label="Copy my text" onPress={() => void copyText()} testID="conflict-copy" />
                <Button variant="secondary" label="Load the latest version" onPress={loadLatest} testID="conflict-latest" />
                <Button variant="secondary" label="Save mine over it" onPress={keepMine} testID="conflict-mine" />
              </View>
            </View>
          ) : null}
          {editSave.kind === "error" ? (
            <View accessibilityRole="alert" style={{ gap: 8 }} testID="entry-save-error">
              <Notice tone="warning">{`Not saved: ${editSave.message}`}</Notice>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button variant="secondary" icon="rotate" label="Retry" onPress={() => flushEdit("explicit")} testID="save-retry" />
                <Button variant="secondary" label="Copy my text" onPress={() => void copyText()} testID="save-copy" />
              </View>
            </View>
          ) : null}
          {copyNotice && (editSave.kind === "conflict" || editSave.kind === "error") ? <Txt accessibilityLiveRegion="polite">{copyNotice}</Txt> : null}
          </>
        )}
        {props.mode === "edit" && !readOnly && props.sync?.state === "conflict" ? <ConflictPanel sync={props.sync} onResolved={resolved} /> : null}
        {props.mode === "edit" && props.sync?.state === "error" ? (
          <View accessibilityRole="alert" style={{ gap: 8 }}>
            <Notice tone="warning">{props.sync.error}</Notice>
            <Button variant="secondary" icon="rotate" label="Try sync again" style={{ alignSelf: "flex-start" }} onPress={() => journalStudy.retry()} />
          </View>
        ) : null}
        {changedElsewhere && props.mode === "edit" && props.sync?.state !== "conflict" && editSave.kind !== "conflict" ? (
          <Notice tone="warning">
            {account
              ? "This entry was changed on the website or another device while you were editing. If you save, you’ll be asked which version to keep."
              : "This entry was changed somewhere else while you were editing. If you save, you’ll be asked which version to keep."}
          </Notice>
        ) : null}
        {props.mode === "edit" && props.sync && !dirty && props.sync.state !== "conflict" && props.sync.state !== "error" ? <SyncLine sync={props.sync} /> : null}
        {saveLine ? (
          <Text accessibilityLiveRegion="polite" testID="entry-save-state" style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: dirty ? colors.foregroundSoft : colors.readerRead }}>
            {saveLine}
          </Text>
        ) : null}
        {props.mode === "edit" ? (
          <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.rule, gap: 8 }}>
            <Txt style={{ fontSize: 12, color: colors.foregroundSoft }}>
              {`Created ${new Date(note!.created_at).toLocaleString()} · ${account ? "In your account" : "Saved on this device"}`}
            </Txt>
            {deletable ? (
              <Button variant="danger" icon="trash" label={props.deleting ? "Deleting…" : "Delete entry"} disabled={props.deleting} style={{ alignSelf: "flex-start" }} onPress={remove} testID="delete-entry" />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
