"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  chapterHref,
  chapterKey,
  chapterVerses,
  passageKey,
  passageTitle,
  previewFromState,
  previewState,
  selectPassage,
  type PassageTarget,
  type PassageVerse,
} from "./passagePreview.ts";
import styles from "./studyCompanion.module.css";

/*
  Scripture previews: a scripture reference in the guide opens its verses in a modal <dialog> over the guide,
  with a link to the whole chapter in the reader. This week's chapters come from the companion's own data;
  any other chapter from the local scripture library (/api/scriptures/lds-chapter).

  The open preview has its own history entry at the same URL (its state is the page's, Next.js router state
  included, plus the passage; see passagePreview.ts), so Back closes it and Forward opens it again, and the
  page's URL, hash, and router state are never touched. Closing it here steps back off that entry; following
  the full-chapter link steps back off it too before going, so the chapter takes its place in history and
  Back from the chapter returns to the guide, not to the preview.

  The page never moves under a preview. Stepping back off its entry would let the browser restore a scroll
  position it saved for the guide's entry earlier (not where the reader is), so while a preview's entry is
  on top, the guide's entry is set to manual scroll restoration; once the page is back on it, the preview
  puts the page exactly where it found it (through the companion's own scroll, which the scroll sync knows
  is not the reader's) and gives the entry its own restoration back.
*/

type Loaded = { status: "ready"; verses: PassageVerse[] } | { status: "missing" } | { status: "failed" };

type Options = {
  /** The guide's own chapters, already on the page: previews of them need no request. */
  local: { volume: string; book: string; chapters: ReadonlyArray<{ chapter: number; verses: PassageVerse[] }> };
  /** Whether a passage can also be shown in the paired scripture beside the guide (this week's chapters). */
  besideGuide: (target: PassageTarget) => boolean;
  showBesideGuide: (target: PassageTarget, opener: HTMLElement | null) => void;
  /** Return the page to `top`, a window.scrollY the preview recorded when it opened. */
  restoreScroll: (top: number) => void;
  /** The scripture-first reader opens the passage in the page instead of beside the guide. */
  showBesideLabel?: string;
  /** Clear any covering reader UI before navigating, including a jump within the current chapter. */
  beforeChapterNavigation?: () => void;
};

/** What opened the preview: focus returns there, and the page to where it was then (its window.scrollY). */
type Opener = { key: string; element: HTMLElement | null; scrollY: number };

/**
 * A step back off a preview's entry: what waits for it, the fallback timer in case its popstate never comes,
 * and whether it has landed (the page is put back on the next frame, see `land`).
 */
type Settling = { then: (() => void) | null; timer: number; landing: boolean };

/** How long a step back off a closed preview's entry may take before it is treated as done. */
const SETTLE_MS = 1000;

function typesetDashes(text: string): string {
  return text.replace(/--/g, "—");
}

async function loadChapter(volume: string, book: string, chapter: number, signal: AbortSignal): Promise<Loaded> {
  const query = new URLSearchParams({ volume, book, chapter: String(chapter) });
  try {
    const response = await fetch(`/api/scriptures/lds-chapter?${query}`, { signal });
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "failed" };
    const verses = chapterVerses(await response.json(), chapter);
    return verses ? { status: "ready", verses } : { status: "missing" };
  } catch {
    return { status: "failed" };
  }
}

function noModifiers(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** The scripture preview. Returns `open` for the guide's links, and the dialog to render once on the page. */
export function usePassagePreview({ local, besideGuide, showBesideGuide, restoreScroll, showBesideLabel = "Show beside the guide", beforeChapterNavigation }: Options) {
  const router = useRouter();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** The preview on screen, as event handlers need it at once (the state shows it a render later). */
  const openRef = useRef<PassageTarget | null>(null);
  const openerRef = useRef<Opener | null>(null);
  /** A preview's history entry still being stepped back off, and what waits for that. */
  const settlingRef = useRef<Settling | null>(null);
  /**
   * The guide entry's own scroll restoration, while a preview's entry on top of it has it set to "manual";
   * null otherwise.
   */
  const restorationRef = useRef<ScrollRestoration | null>(null);
  /** What to do once the dialog has closed (Show beside the guide). */
  const afterCloseRef = useRef<(() => void) | null>(null);
  /** On the way to the full chapter: neither focus nor the page's position is returned. */
  const leavingRef = useRef(false);
  const sequence = useRef(0);
  const [shown, setShown] = useState<{ target: PassageTarget; id: number } | null>(null);
  /** Chapters fetched (or found missing), by chapterKey; failed requests by request, so they can be retried. */
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [attempt, setAttempt] = useState(0);

  const show = useCallback((target: PassageTarget) => {
    openRef.current = target;
    sequence.current += 1;
    setShown({ target, id: sequence.current });
  }, []);

  const hide = useCallback(() => {
    openRef.current = null;
    setShown(null);
  }, []);

  /**
   * The page is on the entry under the preview again (or never left it). On the next frame, once the browser
   * has finished the history step: the page goes back exactly where the preview found it (unless the reader
   * is leaving for the chapter), the entry gets its own scroll restoration back, and whatever waited runs.
   * Opening another preview meanwhile waits too (see `open`).
   */
  const land = useCallback(
    (then: (() => void) | null) => {
      const opener = openerRef.current;
      settlingRef.current = { then, timer: 0, landing: true };
      window.requestAnimationFrame(() => {
        const waiting = settlingRef.current?.then ?? null;
        settlingRef.current = null;
        if (opener && !leavingRef.current && Math.abs(window.scrollY - opener.scrollY) > 1) restoreScroll(opener.scrollY);
        const restoration = restorationRef.current;
        restorationRef.current = null;
        if (restoration) window.history.scrollRestoration = restoration;
        waiting?.();
      });
    },
    [restoreScroll]
  );

  /** A step back off a preview's entry has landed (its popstate, or the fallback timer). */
  const settle = useCallback(() => {
    const settling = settlingRef.current;
    if (!settling || settling.landing) return;
    window.clearTimeout(settling.timer);
    land(settling.then);
  }, [land]);

  /** Step back off the preview's entry (the dialog is already closed), then run `then`. */
  const stepBack = useCallback(
    (then: (() => void) | null) => {
      if (!previewFromState(window.history.state)) {
        land(then);
        return;
      }
      settlingRef.current = { then, timer: window.setTimeout(settle, SETTLE_MS), landing: false };
      window.history.back();
    },
    [land, settle]
  );

  const open = useCallback(
    (target: PassageTarget, element: HTMLElement | null) => {
      const request = () => {
        leavingRef.current = false;
        openerRef.current = { key: passageKey(target), element, scrollY: window.scrollY };
        const state: unknown = window.history.state;
        // One preview entry at most: an entry that already holds a preview is reused, never stacked on.
        if (previewFromState(state)) {
          window.history.replaceState(previewState(state, target), "");
        } else {
          // The guide's entry, until the page is back on it: no browser scroll restoration (see `land`).
          if (restorationRef.current == null) restorationRef.current = window.history.scrollRestoration;
          window.history.scrollRestoration = "manual";
          window.history.pushState(previewState(state, target), "");
        }
        show(target);
      };
      // A preview just closed here is still stepping back off its entry: open once that has landed.
      if (settlingRef.current) settlingRef.current.then = request;
      else request();
    },
    [show]
  );

  // Back and Forward. Arriving on an entry that holds a preview (a reload, or a page restored without its
  // live state) shows it too.
  useEffect(() => {
    const settling = settlingRef;
    const onPopState = () => {
      // A step back off a preview's entry, taken here, has landed.
      if (settlingRef.current) {
        settle();
        return;
      }
      const target = previewFromState(window.history.state);
      if (target) {
        const key = passageKey(target);
        if (openRef.current && passageKey(openRef.current) === key) return;
        if (openerRef.current?.key !== key) openerRef.current = { key, element: null, scrollY: window.scrollY };
        show(target);
      } else if (openRef.current) {
        // Back, with a preview open: it closes, and the page stays where it was.
        hide();
        land(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    const frame = window.requestAnimationFrame(() => {
      const target = previewFromState(window.history.state);
      if (!target || openRef.current || settlingRef.current) return;
      openerRef.current = { key: passageKey(target), element: null, scrollY: window.scrollY };
      show(target);
    });
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.cancelAnimationFrame(frame);
      if (settling.current) window.clearTimeout(settling.current.timer);
      settling.current = null;
    };
  }, [show, hide, settle, land]);

  // Open and close the native dialog with the state, before paint, so it never shows empty. Each passage
  // starts at its top, with focus on its text (a keyboard scrolls it from there).
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (shown) {
      if (!dialog.open) dialog.showModal();
      const body = bodyRef.current;
      if (body) {
        body.scrollTop = 0;
        body.focus({ preventScroll: true });
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [shown]);

  const onDialogClose = () => {
    const opener = openerRef.current;
    const after = afterCloseRef.current;
    afterCloseRef.current = null;
    if (openRef.current) {
      // Closed here (Close, Escape, the backdrop, Show beside the guide): take its history entry back off too,
      // so the next Back leaves the page as usual instead of doing nothing. The page is put back once that
      // step has landed (see `land`); closed by Back, it already has.
      hide();
      stepBack(after);
    }
    if (leavingRef.current) return;
    const element = opener?.element;
    if (element?.isConnected) element.focus({ preventScroll: true });
  };

  const dismiss = (after: (() => void) | null = null) => {
    afterCloseRef.current = after;
    dialogRef.current?.close();
  };

  const onChapterLink = (event: MouseEvent<HTMLAnchorElement>) => {
    // New tabs and windows are the browser's; the preview stays open here.
    if (event.defaultPrevented || !noModifiers(event)) return;
    const href = event.currentTarget.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    // The chapter takes the preview's place in history, so Back from it returns to the guide: step back off
    // the preview's entry (giving the guide's entry its own scroll restoration back) and go from there.
    leavingRef.current = true;
    hide();
    stepBack(() => {
      beforeChapterNavigation?.();
      router.push(href);
    });
  };

  const target = shown?.target ?? null;
  const localVerses = useMemo(() => {
    if (!target || target.volume !== local.volume || target.book !== local.book) return null;
    const entry = local.chapters.find((item) => item.chapter === target.chapter);
    return entry ? chapterVerses({ verses: entry.verses }, target.chapter) : null;
  }, [target, local]);
  const key = target ? chapterKey(target) : null;
  const requestKey = shown && key ? `${shown.id}:${attempt}:${key}` : null;
  const cached = key ? loaded[key] : undefined;
  const failed = requestKey ? loaded[requestKey] : undefined;
  const fetchNeeded = target != null && localVerses == null && cached == null && failed == null;
  const volume = target?.volume;
  const book = target?.book;
  const chapter = target?.chapter;

  // Any other chapter: one request per chapter, abandoned as soon as the preview closes or changes. Its answer
  // is filed under the chapter (or the request, when it failed), so a late answer never shows elsewhere.
  useEffect(() => {
    if (!fetchNeeded || !key || !requestKey || volume == null || book == null || chapter == null) return;
    const controller = new AbortController();
    void loadChapter(volume, book, chapter, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setLoaded((previous) => ({ ...previous, [result.status === "failed" ? requestKey : key]: result }));
    });
    return () => controller.abort();
  }, [fetchNeeded, key, requestKey, volume, book, chapter]);

  const verses = localVerses ?? (cached?.status === "ready" ? cached.verses : null);
  const selection = target && verses ? selectPassage(target, verses) : null;
  const title = target ? passageTitle(target) : "";
  const chapterTitle = target ? `${target.label} ${target.chapter}` : "";
  const loading = target != null && verses == null && cached == null && failed == null;

  let body: ReactNode = null;
  if (selection?.ok) {
    body = (
      <ol className={`${styles.verses} ${styles.passageVerses}`}>
        {selection.verses.map((verse) => (
          <li key={verse.verse} value={verse.verse}>
            <span className={styles.verseNumber} aria-hidden="true">
              {verse.verse}
            </span>
            <span className={styles.srOnly}>Verse {verse.verse}: </span>
            {typesetDashes(verse.text)}
          </li>
        ))}
      </ol>
    );
  } else if (selection) {
    body = (
      <p role="alert" className={styles.passageNote}>
        {chapterTitle} has {selection.count} verses, so {title} isn&apos;t in it.
      </p>
    );
  } else if (cached?.status === "missing") {
    body = (
      <p role="alert" className={styles.passageNote}>
        {chapterTitle} isn&apos;t available in Verse Together&apos;s scripture library.
      </p>
    );
  } else if (failed) {
    body = (
      <div role="alert" className={styles.passageNote}>
        <p>Couldn&apos;t load {chapterTitle}. Check your connection and try again.</p>
        <button
          type="button"
          className={styles.passageAction}
          onClick={() => {
            setAttempt((count) => count + 1);
            bodyRef.current?.focus({ preventScroll: true });
          }}
        >
          Try again
        </button>
      </div>
    );
  } else if (loading) {
    body = (
      <p role="status" className={styles.passageNote}>
        Loading {title}…
      </p>
    );
  }

  const layer = (
    <dialog
      ref={dialogRef}
      className={styles.passageDialog}
      aria-labelledby={titleId}
      onClose={onDialogClose}
      onClick={(event) => {
        // The panel fills the dialog box, so a click on the dialog itself is a click on its backdrop. The second
        // click of a double click on the reference that opened it is not a request to close it.
        if (event.target === event.currentTarget && event.detail < 2) dismiss();
      }}
    >
      {target ? (
        <div className={styles.passagePanel}>
          <div className={styles.passageHead}>
            <h2 id={titleId} className={styles.passageTitle}>
              {title}
            </h2>
            <button type="button" className={styles.passageClose} onClick={() => dismiss()}>
              Close
            </button>
          </div>
          <div
            ref={bodyRef}
            className={styles.passageBody}
            role="region"
            aria-label={`${title}, scripture text`}
            aria-busy={loading || undefined}
            tabIndex={0}
          >
            {body}
          </div>
          <div className={styles.passageActions}>
            {besideGuide(target) && selection?.ok ? (
              <button
                type="button"
                className={styles.passageAction}
                onClick={() => {
                  const opener = openerRef.current?.element ?? null;
                  dismiss(() => showBesideGuide(target, opener));
                }}
              >
                {showBesideLabel}
              </button>
            ) : null}
            <a href={chapterHref(target, selection?.ok !== false)} className={styles.passageChapterLink} onClick={onChapterLink}>
              Open {chapterTitle} in the reader
            </a>
          </div>
        </div>
      ) : null}
    </dialog>
  );

  return { open, layer };
}
