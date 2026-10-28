"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { VerseActionAnchorRect } from "@/components/VerseActionBar";
import { extractSingleSelectedWord } from "@/lib/selectedWord";
import { positionSelectionPopover } from "@/lib/selectionPopover";
import type { WordStudyContext } from "@/lib/wordStudySources";
import { useHeldSelection } from "./useHeldSelection";
import styles from "./wordExplore.module.css";

const WordStudyPanel = dynamic(() => import("@/components/WordStudyPanel"));
type OpenExplore = (word: string, context?: WordStudyContext | null) => void;
const ExploreContext = createContext<OpenExplore | null>(null);

/** Adds Explore to an existing selection menu without changing its annotation behavior. */
export function useSelectionExplore(text: string, clear: () => void, context?: WordStudyContext | null) {
  const open = useContext(ExploreContext);
  const word = extractSingleSelectedWord(text);
  return {
    selectedWord: word,
    showExplore: !!word && !!open,
    onExplore: () => {
      if (!word || !open) return;
      clear();
      open(word, context);
    },
  };
}

type Selection = { word: string; anchor: VerseActionAnchorRect };
function sameSelection(a: Selection, b: Selection) {
  return a.word === b.word && a.anchor.top === b.anchor.top && a.anchor.left === b.anchor.left &&
    a.anchor.width === b.anchor.width && a.anchor.height === b.anchor.height;
}

/** Text outside the scripture and guide annotation roots still gets an Explore action. */
function PageSelection({ root, open }: { root: RefObject<HTMLDivElement | null>; open: OpenExplore }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const contains = useCallback((node: Node) => !!root.current?.contains(node), [root]);
  const read = useCallback((range: Range): Selection | null => {
    const node = range.commonAncestorContainer;
    const element = node instanceof Element ? node : node.parentElement;
    // These selections already have Explore in their annotation menu. Editable fields and overlays
    // own their selections, so never put page actions over them.
    if (element?.closest('[data-cfm-selection], input, textarea, [contenteditable], dialog, [role="dialog"]')) return null;
    const word = extractSingleSelectedWord(range.toString());
    const rect = Array.from(range.getClientRects()).find(rect => rect.width > 0 && rect.height > 0);
    if (!word || !rect) return null;
    const { top, left, right, bottom, width, height } = rect;
    return { word, anchor: { top, left, right, bottom, width, height } };
  }, []);
  const { selection, clear } = useHeldSelection({ menuRef, contains, read, same: sameSelection });
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu || !selection) return;
    const position = positionSelectionPopover(selection.anchor, menu.getBoundingClientRect(), {
      width: window.innerWidth, height: window.innerHeight,
    });
    menu.style.top = `${position.top}px`;
    menu.style.left = `${position.left}px`;
  }, [selection]);
  if (!selection) return null;
  return createPortal(
    <div ref={menuRef} className={styles.selection} role="group" aria-label="Selection actions">
      <button type="button" onMouseDown={event => { if (event.button === 0) event.preventDefault(); }} onClick={() => { clear(); open(selection.word); }}>
        Explore “{selection.word}”
      </button>
      <button type="button" aria-label="Clear selection" onClick={clear}>×</button>
    </div>, document.body,
  );
}

function ExploreSidebar({ word, context, onClose }: { word: string; context?: WordStudyContext | null; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // An open scripture preview owns Escape; disclosures handle it before it reaches the window.
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]")) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return createPortal(
    <aside className={styles.sidebar} aria-label={`Explore ${word}`}>
      <WordStudyPanel word={word} title="Explore" context={context} onClose={onClose} />
    </aside>, document.body,
  );
}

function ExplorePage({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ word: string; context?: WordStudyContext | null } | null>(null);
  const open = useCallback<OpenExplore>((word, context) => setActive({ word, context }), []);
  const close = useCallback(() => setActive(null), []);
  return (
    <ExploreContext.Provider value={open}>
      <div ref={root} className={styles.root} data-exploring={active ? "true" : undefined}>{children}</div>
      {active ? <ExploreSidebar word={active.word} context={active.context} onClose={close} /> : null}
      <PageSelection root={root} open={open} />
    </ExploreContext.Provider>
  );
}

export default function WordExplore({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <ExplorePage key={pathname}>{children}</ExplorePage>;
}
