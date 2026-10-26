import type { InsightDraft } from "../../lib/appData";
import type {
  AnnotationChapter,
  AnnotationVerse,
  MarkColor,
  VerseAnnotation,
  VerseMarksPatch,
} from "../annotations/verseAnnotations";
import { annotationChapter } from "../annotations/verseAnnotations";
import type { GuideHighlightRecord } from "../comeFollowMe/guideAnchors";
import {
  sameGuideAnchor,
  annotationProblem,
  applyGuidePatch,
  applyVerseMarks,
  DEFAULT_UNDERLINE_COLOR,
  guideHighlightProblem,
  guidePatchProblem,
  verseMarksProblem,
  type GuideAnchorFields,
  type GuideAnnotationPatch,
} from "../../../convex/annotationRules";
import { deriveNoteTitle, markdownExcerpt, NOTE_MARKDOWN_MAX } from "../../../convex/noteJournal";
import { localDateKey, newRequestId, type NoteSource, type JournalEntry } from "./journal";
import { RevisionConflictError } from "./journalOutbox";
import { journalGoalsProblem, type JournalGoals } from "../../lib/journalGoals";

export const DEVICE_STUDY_KEY = "vt_device_study_v1";
type Owned = { owner: string | null };
export type DeviceNote = InsightDraft & Owned;
export type DeviceAnnotation = VerseAnnotation & AnnotationVerse & Owned;
/** A guest's annotated guide span: rows saved before guide underlines and notes have a highlight alone. */
export type DeviceHighlight = GuideHighlightRecord & Owned;
export type DeviceStudy = {
  version: 1;
  notes: DeviceNote[];
  annotations: DeviceAnnotation[];
  highlights: DeviceHighlight[];
  /** Guest targets stay on this device; signed-in accounts use their private cloud targets. */
  journalGoals?: JournalGoals;
};
export const EMPTY_DEVICE_STUDY: DeviceStudy = { version: 1, notes: [], annotations: [], highlights: [] };
type StoragePort = Pick<Storage, "getItem" | "setItem">;

/** Writes reach storage before subscribers see success. Quota/private-mode failures keep the editor unsaved. */
export class DeviceStudyStore {
  private snapshot = EMPTY_DEVICE_STUDY;
  private raw: string | null = null;
  private listeners = new Set<() => void>();
  constructor(private storage: () => StoragePort) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  refresh = () => {
    const raw = this.storage().getItem(DEVICE_STUDY_KEY);
    if (raw === this.raw) return;
    const value: unknown = raw ? JSON.parse(raw) : EMPTY_DEVICE_STUDY;
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("notes" in value) ||
      !Array.isArray(value.notes) ||
      !("annotations" in value) ||
      !Array.isArray(value.annotations) ||
      !("highlights" in value) ||
      !Array.isArray(value.highlights)
    )
      throw new Error("Your device's study data couldn't be read.");
    this.raw = raw;
    this.snapshot = value as DeviceStudy;
    this.listeners.forEach((listener) => listener());
  };
  private write(change: (data: DeviceStudy) => DeviceStudy) {
    this.refresh();
    const next = change(this.snapshot);
    const raw = JSON.stringify(next);
    this.storage().setItem(DEVICE_STUDY_KEY, raw);
    this.raw = raw;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
  saveJournalGoals(goals: JournalGoals) {
    const problem = journalGoalsProblem(goals);
    if (problem) throw new Error(problem);
    this.write(data => ({ ...data, journalGoals: { ...goals } }));
  }
  createNote(input: {
    requestId?: string;
    markdownBody?: string;
    journalDate?: string;
    source?: NoteSource;
    logReading?: boolean;
  }) {
    const id = `device-${input.requestId ?? newRequestId()}`;
    this.write((data) => {
      if (data.notes.some((note) => note.id === id)) return data;
      const now = new Date().toISOString();
      const text = input.markdownBody ?? "";
      if (text.length > NOTE_MARKDOWN_MAX) throw new Error("This note is too long.");
      const note: DeviceNote = {
        id,
        owner: null,
        title: deriveNoteTitle(text),
        status: "draft",
        visibility: "private",
        tags: [],
        blocks: [],
        markdown_body: text,
        markdown_revision: 0,
        markdown_canonical: true,
        journal_date: input.journalDate ?? localDateKey(),
        source: input.source ?? null,
        reading_at: input.logReading ? now : null,
        created_at: now,
        updated_at: now,
        last_active_at: now,
      };
      return { ...data, notes: [note, ...data.notes] };
    });
    return { id };
  }
  saveNote(id: string, text: string, expectedRevision: number) {
    let revision = 0;
    this.write((data) => {
      const note = data.notes.find((row) => row.id === id && row.owner === null);
      if (!note) throw new Error("Note not found on this device.");
      if (note.markdown_revision !== expectedRevision) throw new RevisionConflictError(note.markdown_revision ?? 0);
      if (text.length > NOTE_MARKDOWN_MAX) throw new Error("This note is too long.");
      revision = expectedRevision + 1;
      return {
        ...data,
        notes: data.notes.map((row) =>
          row.id === id
            ? {
                ...row,
                markdown_body: text,
                title: deriveNoteTitle(text),
                markdown_revision: revision,
                updated_at: new Date().toISOString(),
              }
            : row,
        ),
      };
    });
    return { markdownRevision: revision };
  }
  setReading(id: string, reading: { source: NoteSource; journalDate: string } | null) {
    this.write((data) => ({
      ...data,
      notes: data.notes.map((note) => {
        if (note.id !== id || note.owner !== null) return note;
        if (!reading && !note.markdown_body?.trim()) throw new Error("Add a note before removing the reading.");
        return {
          ...note,
          source: reading?.source ?? note.source,
          journal_date: reading?.journalDate ?? note.journal_date,
          reading_at: reading ? (note.reading_at ?? new Date().toISOString()) : null,
          updated_at: new Date().toISOString(),
        };
      }),
    }));
  }
  remove(kind: "notes" | "annotations" | "highlights", id: string) {
    this.write((data) => ({ ...data, [kind]: data[kind].filter((row) => row.id !== id || row.owner !== null) }));
  }
  /** The full editor's save: the verse's note, highlight, and underline as given (an omitted mark is none). */
  saveAnnotation(target: AnnotationVerse, body: string, marks: { highlightColor?: MarkColor; underlineColor?: MarkColor } = {}) {
    const { highlightColor, underlineColor } = marks;
    const problem = annotationProblem(body, highlightColor, underlineColor !== undefined);
    if (problem) throw new Error(problem);
    const chapter = annotationChapter(target.volume, target.book, target.chapter);
    this.write((data) => {
      const existing = findDeviceAnnotation(data.annotations, chapter, target.verse);
      const now = new Date().toISOString();
      const row: DeviceAnnotation = {
        ...chapter,
        verse: target.verse,
        id: existing?.id ?? `device-${newRequestId()}`,
        body,
        highlight_color: highlightColor ?? null,
        underline: underlineColor !== undefined,
        underline_color: underlineColor ?? null,
        user_id: "device",
        owner: null,
        is_mine: true,
        visibility: "private",
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };
      return { ...data, annotations: [...data.annotations.filter((item) => item.id !== row.id), row] };
    });
  }
  /**
   * Quick marks on this device: the account's setVerseMarks rule. Only the named marks change; each verse's
   * note stays as saved, and a verse left with no note and no mark is removed.
   */
  setVerseMarks(target: AnnotationChapter, verses: readonly number[], patch: VerseMarksPatch) {
    const unique = Array.from(new Set(verses));
    const problem = verseMarksProblem(unique, patch);
    if (problem) throw new Error(problem);
    const chapter = annotationChapter(target.volume, target.book, target.chapter);
    this.write((data) => {
      const now = new Date().toISOString();
      let annotations = data.annotations;
      for (const verse of unique) {
        const existing = findDeviceAnnotation(annotations, chapter, verse);
        const next = applyVerseMarks(
          existing
            ? {
                body: existing.body,
                highlightColor: existing.highlight_color,
                underline: existing.underline,
                underlineColor: existing.underline_color,
              }
            : null,
          patch,
        );
        const rest = annotations.filter((row) => row !== existing);
        if (!next.keep) {
          annotations = rest;
          continue;
        }
        const row: DeviceAnnotation = {
          ...(existing ?? {
            ...chapter,
            verse,
            id: `device-${newRequestId()}`,
            body: "",
            user_id: "device",
            owner: null,
            is_mine: true,
            visibility: "private",
            created_at: now,
          }),
          highlight_color: next.highlightColor ?? null,
          underline: next.underline,
          underline_color: next.underlineColor ?? null,
          updated_at: now,
        };
        annotations = [...rest, row];
      }
      return { ...data, annotations };
    });
  }
  /** Highlight a guide span (the first guest API): the span's other marks and note stay as saved. */
  saveHighlight(input: GuideAnchorFields & { guide: string; highlightColor: MarkColor }) {
    this.setGuideAnnotation(input, { highlightColor: input.highlightColor });
  }
  /**
   * The guide's selection menu and editor on this device: the account's setGuideAnnotation rule. The span is
   * this device's span `id`, else the one with this exact anchor, else a new one; only the named fields change,
   * and a span left with no note and no mark is removed. Returns the span's id, or null once it is removed.
   */
  setGuideAnnotation(
    input: GuideAnchorFields & { guide: string },
    patch: GuideAnnotationPatch,
    id?: string,
  ): { id: string | null } {
    const problem = guideHighlightProblem(input) ?? guidePatchProblem(patch);
    if (problem) throw new Error(problem);
    let result: string | null = null;
    this.write((data) => {
      const existing =
        (id ? data.highlights.find((row) => row.id === id && row.owner === null && row.guide === input.guide) : undefined) ??
        data.highlights.find((row) => row.owner === null && row.guide === input.guide && sameGuideAnchor(row, input));
      if (id && !existing) throw new Error("Highlight not found on this device.");
      const next = applyGuidePatch(existing, patch);
      const rest = data.highlights.filter((row) => row !== existing);
      if (!next.keep) return { ...data, highlights: rest };
      const anchor: Omit<GuideHighlightRecord, "id" | "updatedAt"> = {
        guide: input.guide,
        part: input.part,
        startBlock: input.startBlock,
        startOffset: input.startOffset,
        endBlock: input.endBlock,
        endOffset: input.endOffset,
        exact: input.exact,
        prefix: input.prefix,
        suffix: input.suffix,
      };
      const row: DeviceHighlight = {
        // A saved span keeps its own anchor; a new one is the selection's.
        ...(existing ?? { ...anchor, owner: null, id: `device-${newRequestId()}` }),
        highlightColor: next.highlightColor ?? null,
        underlineColor: next.underlineColor ?? null,
        body: next.body,
        updatedAt: new Date().toISOString(),
      };
      result = row.id;
      return { ...data, highlights: [...rest, row] };
    });
    return { id: result };
  }
  /** Claim before uploading, so retries after sign-out can never send these records to another account. */
  claim(owner: string) {
    this.write((data) => ({
      ...data,
      notes: data.notes.map((row) => ({ ...row, owner: row.owner ?? owner })),
      annotations: data.annotations.map((row) => ({ ...row, owner: row.owner ?? owner })),
      highlights: data.highlights.map((row) => ({ ...row, owner: row.owner ?? owner })),
    }));
  }
  acknowledge(kind: "notes" | "annotations" | "highlights", id: string, owner: string) {
    this.write((data) => ({ ...data, [kind]: data[kind].filter((row) => row.id !== id || row.owner !== owner) }));
  }
}

/** This device's own (unclaimed) annotation on a verse. */
function findDeviceAnnotation(rows: DeviceAnnotation[], chapter: AnnotationChapter, verse: number) {
  return rows.find(
    (row) =>
      row.owner === null &&
      row.volume === chapter.volume &&
      row.book === chapter.book &&
      row.chapter === chapter.chapter &&
      row.verse === verse,
  );
}

/**
 * The account import of one claimed device annotation: its note, highlight, and underline (in its color). The
 * account keeps any mark it already has on the verse; rows saved before guest underlines have none.
 */
export function annotationImport(row: DeviceAnnotation, owner: string) {
  return {
    deviceImportId: row.id,
    deviceImportOwner: owner,
    volume: row.volume,
    book: row.book,
    chapter: row.chapter,
    verse: row.verse,
    body: row.body,
    highlightColor: row.highlight_color ?? undefined,
    underlineColor: row.underline ? (row.underline_color ?? DEFAULT_UNDERLINE_COLOR) : undefined,
  };
}

/**
 * The account import of one claimed device guide span: its anchor, marks, and note. Rows saved before guide
 * underlines and notes have a highlight alone. The account keeps any mark it already has on the span.
 */
export function guideHighlightImport(row: DeviceHighlight, owner: string) {
  return {
    deviceImportId: row.id,
    deviceImportOwner: owner,
    guide: row.guide,
    part: row.part,
    startBlock: row.startBlock,
    startOffset: row.startOffset,
    endBlock: row.endBlock,
    endOffset: row.endOffset,
    exact: row.exact,
    prefix: row.prefix,
    suffix: row.suffix,
    highlightColor: row.highlightColor ?? undefined,
    underlineColor: row.underlineColor ?? undefined,
    body: row.body || undefined,
  };
}

export const deviceStudy = new DeviceStudyStore(() => window.localStorage);
export function deviceJournal(data: DeviceStudy): JournalEntry[] {
  const notes: JournalEntry[] = data.notes
    .filter((note) => note.owner === null)
    .map((note) => ({
      kind: "note",
      id: note.id,
      title: note.title,
      status: note.status,
      journal_date: note.journal_date!,
      source: note.source ?? null,
      excerpt: markdownExcerpt(note.markdown_body ?? ""),
      has_reflection: !!note.markdown_body?.trim(),
      markdown_revision: note.markdown_revision!,
      markdown_canonical: true,
      reading_at: note.reading_at,
      read_only: false,
      author_label: "You",
      created_at: note.created_at,
      updated_at: note.updated_at,
    }));
  const annotations: JournalEntry[] = data.annotations
    .filter((row) => row.owner === null && row.body.trim())
    .map((row) => ({
      kind: "verse_annotation",
      id: row.id,
      title: null,
      body: row.body,
      journal_date: localDateKey(new Date(row.created_at)),
      source: {
        kind: "scripture",
        label: `${row.book} ${row.chapter}:${row.verse}`,
        href: `/browse/${row.volume}/${row.book}/${row.chapter}#v-${row.verse}`,
        volume: row.volume,
        book: row.book,
        chapter: row.chapter,
        verseStart: row.verse,
        verseEnd: row.verse,
      },
      highlight_color: row.highlight_color,
      read_only: true,
      author_label: "You",
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  return [...notes, ...annotations];
}
