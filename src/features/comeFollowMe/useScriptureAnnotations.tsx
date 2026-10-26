"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useQueries } from "convex/react";
import VerseActionBar, { type VerseActionAnchorRect } from "@/components/VerseActionBar";
import { useAuth } from "@/lib/auth";
import { getDefaultPreferences, readLocalPreferences } from "@/lib/preferences";
import { useDeviceStudy } from "../notes/useDeviceStudy";
import { deviceChapterAnnotations } from "../annotations/useChapterAnnotations";
import VerseAnnotationEditor from "@/features/annotations/VerseAnnotationEditor";
import VerseMarkedText from "@/features/annotations/VerseMarkedText";
import { useVerseQuickMarks } from "@/features/annotations/useVerseQuickMarks";
import {
  annotationChapter,
  highlightOf,
  selectionMarks,
  underlineColorOf,
  type VerseAnnotation,
} from "@/features/annotations/verseAnnotations";
import { selectedVerseRanges, restoreVerseRange, type SelectedVerseTextRange } from "@/lib/verseSelection";
import { api } from "../../../convex/_generated/api";
import {
  collectChapterAnnotations,
  formatScriptureSelection,
  selectionMarkWrites,
  verseKey,
  type VerseKey,
} from "./scriptureAnnotations";
import styles from "./studyCompanion.module.css";
import { useHeldSelection } from "./useHeldSelection";

type Book = { label: string; slug: string; volume: string };

/** A text selection in the scripture pane: the verses it covers (in reading order), its text, and where it is. */
type ScriptureSelection = { verses: VerseKey[]; ranges: SelectedVerseTextRange[]; text: string; anchor: VerseActionAnchorRect };

const NO_VERSES: VerseKey[] = [];

const VERSE_BUTTON = "[data-annotate-verse]";

function readSelection(root: HTMLElement, range: Range): ScriptureSelection | null {
  if (!root.contains(range.commonAncestorContainer)) return null;
  const ranges = selectedVerseRanges(range, root).filter(item => item.chapter !== undefined);
  const verses = ranges.map(item => ({ chapter: item.chapter!, verse: item.verse }));
  const text = ranges.map(item => item.text.slice(item.start, item.end)).join(" ");
  const rect = Array.from(range.getClientRects()).find(each => each.width > 0 || each.height > 0);
  if (!verses.length || !text || !rect) return null;
  const { top, left, right, bottom, width, height } = rect;
  return { verses, ranges, text, anchor: { top, left, right, bottom, width, height } };
}

function sameSelection(a: ScriptureSelection, b: ScriptureSelection) {
  if (a === b) return true;
  if (a.text !== b.text || a.verses.length !== b.verses.length) return false;
  const anchorKeys = ["top", "left", "width", "height"] as const;
  return (
    a.verses.every((verse, index) => verse.chapter === b.verses[index].chapter && verse.verse === b.verses[index].verse &&
      a.ranges[index].start === b.ranges[index].start && a.ranges[index].end === b.ranges[index].end) &&
    anchorKeys.every((key) => a.anchor[key] === b.anchor[key])
  );
}

/**
 * The selection menu (the standard reader's VerseActionBar) beside a text selection in the scripture pane: the
 * reader's quick marks for every selected verse, across a chapter break too, the Annotate panel (any style
 * and color, and the full note editor on the first selected verse), and Copy. Insights and Resources are the
 * standard reader's and aren't offered here. Its own component, so following a selection re-renders only the menu.
 */
function ScriptureSelectionMenu({
  doc,
  book,
  rows,
  loaded,
  onNote,
}: {
  doc: RefObject<HTMLElement | null>;
  book: Book;
  rows: ReadonlyMap<string, VerseAnnotation[]>;
  loaded: ReadonlySet<number>;
  onNote: (verse: VerseKey) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Until the account's presets load, this device's copy of them (the menu shows only after a selection, in the browser).
  const [fallbackPresets] = useState(() => (readLocalPreferences() ?? getDefaultPreferences()).markPresets);
  const contains = useCallback((node: Node) => !!doc.current?.contains(node), [doc]);
  const read = useCallback(
    (range: Range) => (doc.current ? readSelection(doc.current, range) : null),
    [doc]
  );
  const { selection, clear, restore } = useHeldSelection({ menuRef, contains, read, same: sameSelection }, book.slug);

  const restoreRef = useRef<SelectedVerseTextRange[] | null>(null);
  useLayoutEffect(() => {
    if (!restoreRef.current || !doc.current) return;
    const range = restoreVerseRange(doc.current, restoreRef.current);
    if (range) restore(range);
    restoreRef.current = null;
  }, [rows, doc, restore]);

  const verses = selection?.verses ?? NO_VERSES;
  const mine = (verse: VerseKey) => rows.get(verseKey(verse.chapter, verse.verse))?.find((row) => row.is_mine);
  const marks = selectionMarks(verses.map(mine), selection?.ranges);
  const writes = selectionMarkWrites(book, verses).map(write => ({
    ...write,
    ranges: selection?.ranges.filter(range => range.chapter === write.target.chapter)
      .map(range => ({ verse: range.verse, start: range.start, end: range.end, text: range.text })),
  }));
  const { quickMarks, pending } = useVerseQuickMarks({
    selectionKey: selection?.ranges.map(range => `${range.chapter}:${range.verse}:${range.start}:${range.end}`).join(",") ?? "",
    marks,
    writes,
    loaded: verses.length > 0 && verses.every((verse) => loaded.has(verse.chapter)),
    fallbackPresets,
    beforeSave: () => { restoreRef.current = selection?.ranges ?? null; },
    onSaveError: () => { restoreRef.current = null; },
  });

  const noteVerse = verses[0] ?? null;
  const noteLabel =
    verses.length > 1 && noteVerse
      ? `Note on ${writes.length > 1 ? `${noteVerse.chapter}:${noteVerse.verse}` : `verse ${noteVerse.verse}`}`
      : noteVerse && mine(noteVerse)?.body
        ? "Edit your note"
        : "Write a note";

  return (
    <div ref={menuRef} className={styles.selectionMenu}>
      <VerseActionBar
        visible={!!selection}
        anchorRect={selection?.anchor ?? null}
        hasSelection={!!selection}
        selectionReference={formatScriptureSelection(book.label, verses)}
        selectedText={selection?.text ?? ""}
        quickMarks={quickMarks}
        annotationTitle="Annotate"
        annotationDescription="Highlight, underline, or note"
        noteLabel={noteLabel}
        noteDescription={pending ? "Saving marks…" : "Note and marks together"}
        // The optimistic row may not have a server id yet: the full editor waits for the save.
        annotationDisabled={pending}
        showInsightAction={false}
        onClear={clear}
        onAnnotation={() => {
          if (noteVerse && !pending) onNote(noteVerse);
        }}
      />
    </div>
  );
}

/**
 * The viewer's private verse annotations (notes, highlights, underlines) in the Come, Follow Me scripture
 * pane: the same rows, identities, editor, text marks, and selection menu as the standard chapter reader. A
 * verse is annotated from its verse number (a button: click, tap, or Enter/Space, with the arrow keys moving
 * between verses), and selected verses from the selection menu (quick marks, or the full editor). A highlight or underline marks
 * the verse's words (verseText), and any annotation marks the verse's edge; nothing is added to the text flow.
 */
export function useScriptureAnnotations(book: Book, chapters: readonly number[], doc: RefObject<HTMLElement | null>) {
  const { user } = useAuth();
  const device = useDeviceStudy();
  const queries = useMemo(
    () =>
      Object.fromEntries(
        (user ? chapters : []).map((chapter) => [
          String(chapter),
          { query: api.annotations.getChapterAnnotations, args: annotationChapter(book.volume, book.slug, chapter) },
        ])
      ),
    [user, book.volume, book.slug, chapters]
  );
  const remote = useQueries(queries);
  const results = useMemo(() => user ? remote : Object.fromEntries(chapters.map(chapter => [String(chapter), device.loaded ? deviceChapterAnnotations(device.data.annotations, annotationChapter(book.volume, book.slug, chapter)) : undefined])), [user, remote, chapters, device.loaded, device.data, book.volume, book.slug]);
  const { rows, loaded } = useMemo(() => collectChapterAnnotations(chapters, results), [chapters, results]);
  const [editing, setEditing] = useState<VerseKey | null>(null);

  const annotationFor = (chapter: number, verse: number) => rows.get(verseKey(chapter, verse))?.find((row) => row.is_mine);

  /** Attributes for a verse's <li>: color only (an inset edge mark in the highlight's color), never layout. */
  const verseAttributes = (chapter: number, verse: number) => {
    const mine = annotationFor(chapter, verse);
    return {
      "data-verse": verse,
      "data-chapter": chapter,
      "data-annotated": mine ? "true" : undefined,
      "data-highlight": mine?.highlight_color ?? undefined,
    };
  };

  /** A verse's text with the viewer's highlight and underline drawn on its words. */
  const verseText = (chapter: number, verse: number, children: ReactNode, formatText?: (text: string) => string) => (
    <VerseMarkedText annotation={annotationFor(chapter, verse)} formatText={formatText}>{children}</VerseMarkedText>
  );

  const onVerseKeyDown = (event: KeyboardEvent<HTMLElement>, target: VerseKey) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setEditing(target);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(doc.current?.querySelectorAll<HTMLElement>(VERSE_BUTTON) ?? []);
    const next = buttons[buttons.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  /**
   * Props that make a verse number the verse's annotate button without changing its box. Only the first
   * verse of each chapter is in the tab order; the arrow keys move between verses from there.
   */
  const verseNumberProps = (chapter: number, verse: number, tabStop: boolean) => {
    const mine = annotationFor(chapter, verse);
    const color = highlightOf(mine);
    const underline = underlineColorOf(mine);
    const state = mine
      ? (color !== "none" ? `, highlighted ${color}` : "") +
        (underline !== "none" ? `, underlined ${underline}` : "") +
        (mine.body ? ", has your note" : "")
      : "";
    return {
      role: "button",
      tabIndex: tabStop ? 0 : -1,
      "aria-label": `Annotate ${book.label} ${chapter}:${verse}${state}`,
      "data-annotate-verse": "",
      onClick: () => setEditing({ chapter, verse }),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => onVerseKeyDown(event, { chapter, verse }),
    };
  };

  const layer: ReactNode = editing ? (
    <VerseAnnotationEditor
      key={verseKey(editing.chapter, editing.verse)}
      target={{ volume: book.volume, book: book.slug, chapter: editing.chapter, verse: editing.verse }}
      label={`${book.label} ${editing.chapter}:${editing.verse}`}
      rows={rows.get(verseKey(editing.chapter, editing.verse)) ?? []}
      loaded={loaded.has(editing.chapter)}
      onClose={() => setEditing(null)}
    />
  ) : (
    <ScriptureSelectionMenu doc={doc} book={book} rows={rows} loaded={loaded} onNote={setEditing} />
  );

  return { verseAttributes, verseNumberProps, verseText, layer };
}
