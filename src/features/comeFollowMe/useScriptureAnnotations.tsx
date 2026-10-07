"use client";

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useQueries } from "convex/react";
import { useAuth } from "@/lib/auth";
import VerseAnnotationEditor from "@/features/annotations/VerseAnnotationEditor";
import { annotationChapter, highlightOf } from "@/features/annotations/verseAnnotations";
import { api } from "../../../convex/_generated/api";
import { collectChapterAnnotations, selectionVerse, verseKey, type VerseKey } from "./scriptureAnnotations";
import styles from "./studyCompanion.module.css";

type Book = { label: string; slug: string; volume: string };

/** Where the selection's Annotate button sits (viewport px), and which verse it annotates. */
type Chip = VerseKey & { top: number; right: number };

const CHIP_HEIGHT = 36;
const CHIP_MAX_WIDTH = 240;
const CHIP_GAP = 8;
/** Touch browsers clear a selection as a tap on the button begins; keep the button long enough to take the tap. */
const CHIP_LINGER_MS = 400;

const VERSE_BUTTON = "[data-annotate-verse]";

function sameChip(a: Chip | null, b: Chip | null) {
  return a === b || (!!a && !!b && a.chapter === b.chapter && a.verse === b.verse && a.top === b.top && a.right === b.right);
}

/**
 * An Annotate button beside a text selection in the scripture pane, for the verse the selection starts in.
 * Its own component, so following a selection while the panes scroll re-renders only this button.
 */
function SelectionAnnotateButton({
  doc,
  book,
  onOpen,
}: {
  doc: RefObject<HTMLElement | null>;
  book: Book;
  onOpen: (verse: VerseKey) => void;
}) {
  const [chip, setChip] = useState<Chip | null>(null);

  useEffect(() => {
    let frame = 0;
    let hideTimer = 0;
    const hide = () => {
      if (hideTimer) return;
      hideTimer = window.setTimeout(() => {
        hideTimer = 0;
        setChip(null);
      }, CHIP_LINGER_MS);
    };
    const measure = () => {
      frame = 0;
      const root = doc.current;
      const selection = document.getSelection();
      const range = selection && selection.rangeCount > 0 && !selection.isCollapsed ? selection.getRangeAt(0) : null;
      // Only a selection wholly inside the pane: one reaching into the guide or the page is not about a verse.
      if (!root || !range || !root.contains(range.commonAncestorContainer) || !range.toString().trim()) {
        hide();
        return;
      }
      const startNode = range.startContainer;
      const startElement = startNode instanceof Element ? startNode : startNode.parentElement;
      const startVerse = startElement?.closest<HTMLElement>("li[id]");
      const touched = function* () {
        for (const li of root.querySelectorAll<HTMLElement>("li[id]")) if (range.intersectsNode(li)) yield li.id;
      };
      const verse = selectionVerse(startVerse && root.contains(startVerse) ? startVerse.id : null, touched(), book.slug);
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
      const last = rects[rects.length - 1];
      if (!verse || !last) {
        hide();
        return;
      }
      window.clearTimeout(hideTimer);
      hideTimer = 0;
      // Below the selection's end, else above its start; right-aligned to its end and kept on screen.
      const below = last.bottom + CHIP_GAP;
      const top =
        below + CHIP_HEIGHT <= window.innerHeight - CHIP_GAP ? below : Math.max(CHIP_GAP, rects[0].top - CHIP_GAP - CHIP_HEIGHT);
      const right = Math.min(
        Math.max(CHIP_GAP, window.innerWidth - last.right),
        Math.max(CHIP_GAP, window.innerWidth - CHIP_GAP - CHIP_MAX_WIDTH)
      );
      const next = { ...verse, top: Math.round(top), right: Math.round(right) };
      setChip((previous) => (sameChip(previous, next) ? previous : next));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    document.addEventListener("selectionchange", schedule);
    // Any scroller moving (the page, a pane, the strip) carries the selection with it.
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(hideTimer);
    };
  }, [book.slug, doc]);

  if (!chip) return null;
  return (
    <button
      type="button"
      className={styles.annotateChip}
      style={{ top: chip.top, right: chip.right, maxWidth: CHIP_MAX_WIDTH }}
      // Keep the selection while pressing the button.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onOpen({ chapter: chip.chapter, verse: chip.verse })}
    >
      Annotate {book.label} {chip.chapter}:{chip.verse}
    </button>
  );
}

/**
 * The viewer's private verse annotations (notes and highlights) in the Come, Follow Me scripture pane: the
 * same rows, identities, and editor as the standard chapter reader. A verse is annotated from its verse
 * number (a button: click, tap, or Enter/Space, with the arrow keys moving between verses) or from a text
 * selection in the pane (an Annotate button beside it). Annotations only color the verse and mark its
 * edge; nothing is added to the text flow.
 */
export function useScriptureAnnotations(book: Book, chapters: readonly number[], doc: RefObject<HTMLElement | null>) {
  const { user, promptSignIn } = useAuth();
  const queries = useMemo(
    () =>
      Object.fromEntries(
        chapters.map((chapter) => [
          String(chapter),
          { query: api.annotations.getChapterAnnotations, args: annotationChapter(book.volume, book.slug, chapter) },
        ])
      ),
    [book.volume, book.slug, chapters]
  );
  const results = useQueries(queries);
  const { rows, loaded } = useMemo(() => collectChapterAnnotations(chapters, results), [chapters, results]);
  const [editing, setEditing] = useState<VerseKey | null>(null);

  const annotationFor = (chapter: number, verse: number) => rows.get(verseKey(chapter, verse))?.find((row) => row.is_mine);

  /** Attributes for a verse's <li>: color only (a background and an inset edge mark), never layout. */
  const verseAttributes = (chapter: number, verse: number) => {
    const mine = annotationFor(chapter, verse);
    return {
      "data-annotated": mine ? "true" : undefined,
      "data-highlight": mine?.highlight_color ?? undefined,
    };
  };

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
    const state = mine ? (color !== "none" ? `, highlighted ${color}` : "") + (mine.body ? ", has your note" : "") : "";
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
      signedIn={!!user}
      onSignIn={() => {
        void promptSignIn();
      }}
      onClose={() => setEditing(null)}
    />
  ) : (
    <SelectionAnnotateButton doc={doc} book={book} onOpen={setEditing} />
  );

  return { verseAttributes, verseNumberProps, layer };
}
