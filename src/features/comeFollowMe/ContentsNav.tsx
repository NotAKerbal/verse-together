"use client";

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import type { TocItem } from "@/lib/cfm/cfmGuide";
import styles from "./studyCompanion.module.css";

/** Opens the compact (drawer) contents from whichever button asked, and returns focus there on close. */
export type ContentsHandle = { open(opener: HTMLElement): void };

type Props = {
  toc: TocItem[];
  handle: Ref<ContentsHandle>;
  /** Calls `notify` (at most once a frame) whenever the reading position may have moved. */
  subscribe: (notify: () => void) => () => void;
  /** The contents entry the reader is in now, read from the live page; null above the first one. */
  getActive: () => string | null;
  /**
   * Left edge (viewport px) of the reading region as centered in the page, the rail must stay clear of. Never
   * where the region sits beside the rail, which depends on the rail's own width.
   */
  contentLeft: () => number;
  /** Changes whenever the reading region changes width (the companion's mode). */
  layoutKey: string;
  onNavigate: (id: string) => void;
};

// The rail sits in the page's left margin, never in the reading region: this far from the viewport edge,
// this far from the reading region, and only when at least RAIL_MIN fits (keep in sync with the CSS).
const RAIL_EDGE = 16;
const RAIL_GAP = 24;
const RAIL_MIN = 192;
const RAIL_MAX = 272;

/** Scroll `list` (not the page) just enough to show `item`. */
function keepVisible(list: HTMLElement, item: HTMLElement) {
  if (list.clientHeight === 0) return;
  const box = list.getBoundingClientRect();
  const rect = item.getBoundingClientRect();
  const pad = 24;
  if (rect.top < box.top + pad) list.scrollTop -= box.top + pad - rect.top;
  else if (rect.bottom > box.bottom - pad) list.scrollTop += rect.bottom - (box.bottom - pad);
}

function noModifiers(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function ListIcon() {
  return (
    <svg className={styles.contentsIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** The button that opens the drawer. Hidden by CSS while the rail is showing. */
export function ContentsOpener({ onOpen }: { onOpen: (opener: HTMLElement) => void }) {
  return (
    <button
      type="button"
      className={styles.contentsOpener}
      aria-haspopup="dialog"
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <ListIcon />
      <span className={styles.contentsOpenerLabel}>Contents</span>
    </button>
  );
}

type ListProps = {
  variant: "rail" | "drawer";
  toc: TocItem[];
  active: string | null;
  currentChapter: string | null;
  toggled: Record<string, boolean>;
  onToggle: (id: string, open: boolean) => void;
  onLink: (event: MouseEvent<HTMLAnchorElement>, id: string) => void;
};

function ContentsList({ variant, toc, active, currentChapter, toggled, onToggle, onLink }: ListProps) {
  const lastChapter = toc.reduce((last, item, index) => (item.kind === "chapter" ? index : last), -1);
  const groups = [
    { key: "introduction", label: "Introduction", items: toc.filter((item) => item.part === "introduction") },
    {
      key: "chapters",
      label: "Chapter by chapter",
      items: toc.filter((item, index) => item.part === "reader" && index <= lastChapter),
    },
    { key: "closing", label: "After the chapters", items: toc.filter((item, index) => item.part === "reader" && index > lastChapter) },
  ].filter((group) => group.items.length > 0);

  const link = (id: string, children: ReactNode, className?: string) => (
    <a
      href={`#${id}`}
      className={className}
      aria-current={active === id ? "location" : undefined}
      onClick={(event) => onLink(event, id)}
    >
      {children}
    </a>
  );

  return (
    <div className={styles.contentsGroups}>
      {groups.map((group) => (
        <div key={group.key} className={styles.contentsGroup}>
          <p id={`cfm-${variant}-${group.key}`} className={styles.contentsGroupLabel}>
            {group.label}
          </p>
          <ol aria-labelledby={`cfm-${variant}-${group.key}`}>
            {group.items.map((item) => {
              const listId = `cfm-${variant}-verses-${item.id}`;
              const open = toggled[item.id] ?? item.id === currentChapter;
              return (
                <li key={item.id} data-current={item.id === currentChapter ? "true" : undefined}>
                  <div className={styles.contentsRow}>
                    {link(
                      item.id,
                      item.kind === "chapter" && item.book && item.number ? (
                        <>
                          <span className={styles.contentsRef}>
                            {item.book} {item.number}
                          </span>
                          {item.subtitle ? <span className={styles.contentsSubtitle}> {item.subtitle}</span> : null}
                        </>
                      ) : (
                        item.text
                      ),
                      styles.contentsItem
                    )}
                    {item.verses.length > 0 ? (
                      <button
                        type="button"
                        className={styles.contentsExpand}
                        aria-expanded={open}
                        aria-controls={listId}
                        aria-label={`Passages in ${item.text}`}
                        onClick={() => onToggle(item.id, !open)}
                      />
                    ) : null}
                  </div>
                  {item.verses.length > 0 ? (
                    <ol id={listId} className={styles.contentsVerses} hidden={!open}>
                      {item.verses.map((verse) => (
                        <li key={verse.id}>
                          {link(
                            verse.id,
                            <>
                              <span className={styles.contentsRef}>{verse.short}</span> {verse.text}
                            </>
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

/**
 * The guide's contents, outside the reading region. Wide screens: a rail fixed in the page's left margin,
 * which costs the reading region no width; the region centers in the room to its right. Otherwise: a modal
 * drawer opened from a compact Contents button (native <dialog>: Escape closes it, focus stays inside, and
 * returns to the button).
 */
export default function ContentsNav({ toc, handle, subscribe, getActive, contentLeft, layoutKey, onNavigate }: Props) {
  const active = useSyncExternalStore(subscribe, getActive, () => null);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const railRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const drawerListRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(true);

  /** Each contents entry's chapter (or section) row, so the current one can stay expanded. */
  const groupOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of toc) {
      map.set(item.id, item.id);
      for (const verse of item.verses) map.set(verse.id, item.id);
    }
    return map;
  }, [toc]);
  const currentChapter = active ? (groupOf.get(active) ?? null) : null;

  useImperativeHandle(
    handle,
    () => ({
      open(opener: HTMLElement) {
        const dialog = dialogRef.current;
        if (!dialog || dialog.open) return;
        openerRef.current = opener;
        restoreFocusRef.current = true;
        dialog.showModal();
        // Start at the current section rather than the top of a long list.
        const current = dialog.querySelector<HTMLElement>("[aria-current]");
        if (current && drawerListRef.current) {
          keepVisible(drawerListRef.current, current);
          current.focus({ preventScroll: true });
        }
      },
    }),
    []
  );

  // Rail: size it to the margin it actually has, and stand it down (the Contents buttons show instead) where
  // that is too narrow, e.g. with the Notebook panel open. The CSS has already decided the first paint. The
  // width goes on the page, which centers the reading region beside the rail by the same value.
  useEffect(() => {
    const rail = railRef.current;
    const page = rail?.parentElement;
    if (!rail || !page) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const available = contentLeft() - RAIL_EDGE - RAIL_GAP;
      if (available < RAIL_MIN) {
        rail.dataset.blocked = "true";
      } else {
        delete rail.dataset.blocked;
        page.style.setProperty("--cfm-rail-w", `${Math.min(RAIL_MAX, Math.floor(available))}px`);
      }
      // A drawer left open while the window widened into the rail layout is no longer needed.
      const dialog = dialogRef.current;
      if (dialog?.open && getComputedStyle(rail).display !== "none") dialog.close();
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    schedule();
    const resize = new ResizeObserver(schedule);
    resize.observe(page);
    window.addEventListener("resize", schedule);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [contentLeft, layoutKey]);

  // Keep the current entry in view inside the rail's own scroll (the page is never scrolled for it).
  useEffect(() => {
    const rail = railRef.current;
    const current = rail?.querySelector<HTMLElement>("[aria-current]");
    if (rail && current) keepVisible(rail, current);
  }, [active, currentChapter]);

  const onToggle = (id: string, open: boolean) => setToggled((previous) => ({ ...previous, [id]: open }));

  const onLink = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (!noModifiers(event)) return;
    event.preventDefault();
    const dialog = dialogRef.current;
    if (dialog?.open) {
      // The jump focuses its target; focus does not go back to the button.
      restoreFocusRef.current = false;
      dialog.close();
    }
    onNavigate(id);
  };

  const onDialogClose = () => {
    const opener = openerRef.current;
    openerRef.current = null;
    if (restoreFocusRef.current && opener?.isConnected) opener.focus({ preventScroll: true });
  };

  const list = (variant: "rail" | "drawer") => (
    <ContentsList
      variant={variant}
      toc={toc}
      active={active}
      currentChapter={currentChapter}
      toggled={toggled}
      onToggle={onToggle}
      onLink={onLink}
    />
  );

  return (
    <>
      <nav ref={railRef} className={styles.contentsRail} aria-label="Contents">
        <p className={styles.contentsTitle}>Contents</p>
        {list("rail")}
      </nav>
      <dialog
        ref={dialogRef}
        className={styles.contentsDrawer}
        aria-labelledby="cfm-contents-drawer-title"
        onClose={onDialogClose}
        onClick={(event) => {
          // The panel fills the dialog box, so a click on the dialog itself is a click on its backdrop.
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className={styles.drawerPanel}>
          <div className={styles.drawerHead}>
            <h2 id="cfm-contents-drawer-title" className={styles.contentsTitle}>
              Contents
            </h2>
            <button type="button" className={styles.drawerClose} aria-label="Close contents" onClick={() => dialogRef.current?.close()}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div ref={drawerListRef} className={styles.drawerList}>
            <nav aria-label="Contents">{list("drawer")}</nav>
          </div>
        </div>
      </dialog>
    </>
  );
}
