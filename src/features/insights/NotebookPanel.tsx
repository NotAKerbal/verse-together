"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useInsightBuilder } from "./InsightBuilderProvider";
import { useNoteFolders } from "./useNoteFolders";
import {
  ICON_BUTTON_CLASS,
  LightbulbBadge,
  MENU_ITEM_CLASS,
  NoteOptionsMenu,
  NoteSwitcher,
  ShareButton,
  useIsPhoneLayout,
} from "./NoteMenus";
import { NoNotesYet, NoteBlockList, NoteTagChips, SaveStatusLabel } from "./NoteBlocks";
import AiInsightAssistant from "./AiInsightAssistant";

const ACTION_BUTTON_CLASS =
  "surface-button inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50";

// ---------------------------------------------------------------------------
// The note itself: header strip, scrollable body, action row. Shared by the
// desktop panel and the phone sheet.
// ---------------------------------------------------------------------------

function NotebookContent({ variant, onClose }: { variant: "desktop" | "sheet"; onClose: () => void }) {
  const {
    drafts,
    activeDraft,
    activeDraftId,
    isLoading,
    createDraft,
    switchDraft,
    renameDraft,
    deleteDraft,
    addTextBlock,
    addQuoteBlock,
  } = useInsightBuilder();
  const { noteFolderMap, folderParentMap, folderTree, assignFolder } = useNoteFolders();
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [shareSignal, setShareSignal] = useState(0);
  const [focusToken, setFocusToken] = useState(0);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const activeSummary = useMemo(() => drafts.find((draft) => draft.id === activeDraftId) ?? null, [drafts, activeDraftId]);
  const readOnly = activeDraft ? activeDraft.status !== "draft" : false;

  useEffect(() => {
    setRenaming(false);
  }, [activeDraftId]);

  useEffect(() => {
    if (renaming) renameInputRef.current?.select();
  }, [renaming]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }

  const onCreate = () => void run(() => createDraft("New note"));

  async function commitRename() {
    const next = renameValue.trim();
    setRenaming(false);
    if (!activeDraft || !next || next === activeDraft.title.trim()) return;
    await renameDraft(activeDraft.id, next);
  }

  function onDelete() {
    if (!activeDraft) return;
    if (!window.confirm(`Delete "${activeDraft.title}"? This cannot be undone.`)) return;
    void run(() => deleteDraft(activeDraft.id));
  }

  async function onWrite() {
    await run(() => addTextBlock(""));
    setFocusToken((n) => n + 1);
  }

  async function onQuote() {
    await run(() => addQuoteBlock("", ""));
    setFocusToken((n) => n + 1);
  }

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-[color:var(--surface-border)] bg-[color:var(--accent-note)] px-3 py-2.5 font-sans">
        <LightbulbBadge />
        {renaming && activeDraft ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setRenaming(false);
              }
            }}
            aria-label="Note title"
            className="min-w-0 flex-1 rounded-[0.8rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] px-3 py-1.5 font-display text-base font-extrabold tracking-[-0.02em] outline-none"
          />
        ) : (
          <NoteSwitcher
            notes={drafts}
            activeNote={activeSummary}
            activeBlockCount={activeDraft?.blocks.length ?? activeSummary?.block_count}
            noteFolderMap={noteFolderMap}
            folderParentMap={folderParentMap}
            onSelect={(draftId) => void switchDraft(draftId)}
            onCreate={onCreate}
            busy={busy}
          />
        )}
        <NoteOptionsMenu
          note={activeSummary}
          currentFolder={activeDraftId ? noteFolderMap[activeDraftId] ?? "" : ""}
          folderTree={folderTree}
          onRename={() => {
            setRenameValue(activeDraft?.title ?? "");
            setRenaming(true);
          }}
          onMoveToFolder={(folderName) => {
            if (activeDraftId) void assignFolder(activeDraftId, folderName);
          }}
          onVisibility={() => setShareSignal((n) => n + 1)}
          onDelete={onDelete}
          extraItems={
            <Link href="/notes" role="menuitem" data-menu-item className={MENU_ITEM_CLASS}>
              Open the Notes page
            </Link>
          }
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={variant === "desktop" ? "Collapse the notebook" : "Close the notebook"}
          title={variant === "desktop" ? "Collapse" : "Close"}
          className={ICON_BUTTON_CLASS}
        >
          <FontAwesomeIcon icon={variant === "desktop" ? faArrowRight : faXmark} className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 font-sans">
        {isLoading && !activeDraft && activeDraftId ? <p className="text-sm text-foreground/60">Loading note…</p> : null}

        {!activeDraftId && drafts.length === 0 && !isLoading ? <NoNotesYet onCreate={onCreate} busy={busy} /> : null}

        {!activeDraftId && drafts.length > 0 ? (
          <div className="rounded-[1rem] border-2 border-dashed border-[color:var(--surface-border)] px-4 py-5 text-center">
            <p className="font-display text-base font-extrabold tracking-[-0.02em]">Pick a note</p>
            <p className="mt-1 text-xs text-foreground/65">Use the title above to switch notes, or start a fresh one.</p>
            <button
              type="button"
              onClick={onCreate}
              disabled={busy}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--accent-primary)] px-4 text-sm font-bold text-[#17161a] shadow-[var(--surface-shadow-soft)] disabled:opacity-60"
            >
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
              New note
            </button>
          </div>
        ) : null}

        {activeDraft ? (
          <>
            {readOnly ? (
              <p className="rounded-[0.8rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--accent-mint)] px-3 py-2 text-xs font-semibold">
                This note is published, so it can no longer be edited.
              </p>
            ) : null}
            <NoteBlockList blocks={activeDraft.blocks} readOnly={readOnly} focusToken={focusToken} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <NoteTagChips note={activeDraft} readOnly={readOnly} />
              <SaveStatusLabel className="ml-auto" />
            </div>
            {!readOnly ? <AiInsightAssistant draft={activeDraft} onAddTextBlock={addTextBlock} /> : null}
          </>
        ) : null}
      </div>

      <footer
        className="flex shrink-0 items-center gap-2 border-t-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] px-3 pt-2.5 font-sans"
        style={{ paddingBottom: variant === "sheet" ? "max(0.625rem, env(safe-area-inset-bottom))" : "0.625rem" }}
      >
        <button type="button" onClick={() => void onWrite()} disabled={busy || readOnly} className={ACTION_BUTTON_CLASS}>
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
          Write
        </button>
        <button type="button" onClick={() => void onQuote()} disabled={busy || readOnly} className={ACTION_BUTTON_CLASS}>
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
          Quote
        </button>
        <ShareButton note={activeSummary} placement="above" align="right" openSignal={shareSignal} className="ml-auto" />
      </footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop: fixed panel card or the collapsed pill
// ---------------------------------------------------------------------------

function DesktopNotebook() {
  const { isPanelOpen, togglePanel, closeBuilder, activeDraftId, drafts } = useInsightBuilder();
  const activeTitle = drafts.find((draft) => draft.id === activeDraftId)?.title ?? null;
  const panelRef = useRef<HTMLElement | null>(null);
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(isPanelOpen);

  // Keep keyboard focus sensible when the panel expands or collapses.
  useEffect(() => {
    if (wasOpenRef.current === isPanelOpen) return;
    wasOpenRef.current = isPanelOpen;
    if (isPanelOpen) panelRef.current?.focus();
    else pillRef.current?.focus();
  }, [isPanelOpen]);

  if (!isPanelOpen) {
    return (
      <button
        ref={pillRef}
        type="button"
        onClick={togglePanel}
        aria-label={activeTitle ? `Open the notebook: ${activeTitle}` : "Open the notebook"}
        className="simple-hide fixed bottom-4 right-4 z-40 hidden h-11 max-w-[16rem] items-center gap-2 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] pl-1.5 pr-4 text-sm font-bold text-foreground shadow-[var(--surface-shadow-soft)] hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] lg:inline-flex"
      >
        <LightbulbBadge size="md" className="h-8 w-8" />
        <span className="truncate">{activeTitle ?? "Notebook"}</span>
      </button>
    );
  }

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label="Notebook"
      className="simple-hide fixed bottom-4 right-4 top-[calc(var(--header-height)+0.5rem)] z-40 hidden w-[440px] flex-col overflow-hidden rounded-[20px] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] shadow-[var(--surface-shadow)] outline-none lg:flex xl:w-[480px]"
    >
      <NotebookContent variant="desktop" onClose={closeBuilder} />
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Phone: bottom sheet with a scrim
// ---------------------------------------------------------------------------

function PhoneNotebookSheet() {
  const { isMobileOpen, toggleMobileBuilder } = useInsightBuilder();
  const sheetRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const close = useCallback(() => {
    if (isMobileOpen) toggleMobileBuilder();
  }, [isMobileOpen, toggleMobileBuilder]);

  useEffect(() => {
    if (!isMobileOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [isMobileOpen, close]);

  if (!isMobileOpen) return null;

  function onHandleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    dragStartYRef.current = event.touches[0]?.clientY ?? null;
  }
  function onHandleTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    if (dragStartYRef.current === null) return;
    const delta = (event.touches[0]?.clientY ?? dragStartYRef.current) - dragStartYRef.current;
    setDragOffset(Math.max(0, delta));
  }
  function onHandleTouchEnd() {
    const shouldClose = dragOffset > 90;
    dragStartYRef.current = null;
    setDragOffset(0);
    if (shouldClose) close();
  }

  return (
    <div className="simple-hide lg:hidden">
      <button type="button" aria-label="Close the notebook" onClick={close} className="fixed inset-0 z-50 bg-black/30" />
      <section
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Notebook"
        style={{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }}
        className="fixed inset-x-0 bottom-0 z-50 flex h-[66vh] flex-col overflow-hidden rounded-t-[1.25rem] border-2 border-b-0 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] outline-none"
      >
        <div
          className="flex shrink-0 cursor-grab justify-center bg-[color:var(--accent-note)] pb-1 pt-2 touch-none"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          aria-hidden="true"
        >
          <span className="h-1.5 w-12 rounded-full bg-[color:var(--surface-border)] opacity-50" />
        </div>
        <NotebookContent variant="sheet" onClose={close} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function NotebookPanel() {
  const pathname = usePathname();
  const { canUseInsights } = useInsightBuilder();
  const isPhone = useIsPhoneLayout();
  const onNotesPage = pathname === "/notes" || pathname.startsWith("/notes/");

  if (!canUseInsights || onNotesPage) return null;
  return isPhone ? <PhoneNotebookSheet /> : <DesktopNotebook />;
}
