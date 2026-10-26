import type { InsightDraft } from "../../lib/appData";
import type { AnnotationVerse, VerseAnnotation, HighlightColor } from "../annotations/verseAnnotations";
import { annotationChapter } from "../annotations/verseAnnotations";
import type { GuideHighlight } from "../comeFollowMe/guideAnchors";
import { sameGuideAnchor, annotationProblem, guideHighlightProblem } from "../../../convex/annotationRules";
import { deriveNoteTitle, NOTE_MARKDOWN_MAX } from "../../../convex/noteJournal";
import { localDateKey, newRequestId, type NoteSource, type JournalEntry } from "./journal";
import { RevisionConflictError } from "./journalOutbox";

export const DEVICE_STUDY_KEY = "vt_device_study_v1";
type Owned = { owner: string | null };
export type DeviceNote = InsightDraft & Owned;
export type DeviceAnnotation = VerseAnnotation & AnnotationVerse & Owned;
export type DeviceHighlight = GuideHighlight & Owned;
export type DeviceStudy = {
  version: 1;
  notes: DeviceNote[];
  annotations: DeviceAnnotation[];
  highlights: DeviceHighlight[];
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
  saveAnnotation(target: AnnotationVerse, body: string, highlightColor?: HighlightColor) {
    const problem = annotationProblem(body, highlightColor);
    if (problem) throw new Error(problem);
    const chapter = annotationChapter(target.volume, target.book, target.chapter);
    this.write((data) => {
      const existing = data.annotations.find(
        (row) =>
          row.owner === null &&
          row.volume === chapter.volume &&
          row.book === chapter.book &&
          row.chapter === chapter.chapter &&
          row.verse === target.verse,
      );
      const now = new Date().toISOString();
      const row: DeviceAnnotation = {
        ...chapter,
        verse: target.verse,
        id: existing?.id ?? `device-${newRequestId()}`,
        body,
        highlight_color: highlightColor ?? null,
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
  saveHighlight(input: Omit<GuideHighlight, "id" | "updatedAt">) {
    const problem = guideHighlightProblem(input);
    if (problem) throw new Error(problem);
    this.write((data) => {
      const existing = data.highlights.find(
        (row) => row.owner === null && row.guide === input.guide && sameGuideAnchor(row, input),
      );
      return {
        ...data,
        highlights: [
          ...data.highlights.filter((row) => row.id !== existing?.id),
          {
            ...input,
            owner: null,
            id: existing?.id ?? `device-${newRequestId()}`,
            updatedAt: new Date().toISOString(),
          },
        ],
      };
    });
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
      excerpt: note.markdown_body?.slice(0, 240) ?? null,
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
