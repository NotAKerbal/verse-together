"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/lib/auth";
import type { InsightDraft, InsightDraftSummary, InsightVisibility } from "@/lib/appData";
import { isSafeSourceHref, localDateKey, type JournalNoteDocument, type NoteSource } from "@/features/notes/journal";
import { JournalOutbox, RevisionConflictError, type OutboxEntry } from "@/features/notes/journalOutbox";
import { useConvexSignedIn } from "@/features/notes/useConvexSignedIn";

/**
 * What the page being read says about itself. `href` defaults to the live URL (path, query and hash) at the
 * moment a note is created, so a note made mid-chapter links back to where the reader actually was.
 */
export type RegisteredNoteSource = Omit<NoteSource, "href"> & { href?: string };

type ScripturePayload = {
  volume: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  reference: string;
  text?: string | null;
};

type DictionaryPayload = {
  edition: "1828" | "1844" | "1913" | "ETY";
  word: string;
  heading?: string | null;
  pronounce?: string | null;
  entryText: string;
};

export type NoteSaveStatus = "idle" | "saving" | "saved";

type InsightBuilderContextValue = {
  canUseInsights: boolean;
  /** Phone bottom sheet. */
  isMobileOpen: boolean;
  /** Desktop panel: expanded (true) or collapsed to the pill (false). Remembered per user. */
  isPanelOpen: boolean;
  openBuilder: () => void;
  closeBuilder: () => void;
  toggleMobileBuilder: () => void;
  togglePanel: () => void;
  /** "saving" while any note write is in flight, "saved" right after one lands. */
  saveStatus: NoteSaveStatus;
  lastSavedAt: number | null;
  drafts: InsightDraftSummary[];
  activeDraftId: string | null;
  activeDraft: InsightDraft | null;
  isLoading: boolean;
  createDraft: (title?: string) => Promise<string | null>;
  switchDraft: (draftId: string) => Promise<void>;
  clearActiveDraft: () => void;
  renameDraft: (draftId: string, title: string) => Promise<void>;
  saveDraftSettings: (payload: { draftId: string; title?: string; tags?: string[]; visibility?: InsightVisibility }) => Promise<void>;
  deleteDraft: (draftId: string) => Promise<void>;
  addTextBlock: (text?: string) => Promise<void>;
  addQuoteBlock: (
    text?: string,
    linkUrl?: string,
    options?: { highlightText?: string; highlightWordIndices?: number[] }
  ) => Promise<void>;
  addDictionaryBlock: (payload: DictionaryPayload) => Promise<void>;
  appendScriptureBlock: (payload: ScripturePayload) => Promise<void>;
  updateBlock: (
    blockId: string,
    patch: {
      text?: string;
      linkUrl?: string;
      highlightText?: string;
      highlightWordIndices?: number[];
      dictionaryMeta?: {
        edition: "1828" | "1844" | "1913" | "ETY";
        word: string;
        heading?: string | null;
        pronounce?: string | null;
      };
    }
  ) => Promise<void>;
  removeBlock: (blockId: string) => Promise<void>;
  reorderBlocks: (fromIndex: number, toIndex: number) => Promise<void>;
  publishDraft: (title?: string, summary?: string) => Promise<void>;
  /** Closes the phone flag only; the desktop panel keeps its own state. */
  dismissMobile: () => void;
  /** The active note's Markdown fields, as getDraft returns them (projected Markdown for older notes). */
  activeNote: JournalNoteDocument | null;
  /** The source the current reader or guide page registered, or null on other pages. */
  currentSource: RegisteredNoteSource | null;
  registerNoteSource: (source: RegisteredNoteSource) => () => void;
  /** The current source with its live href, ready to store; null when there is none or it isn't storable. */
  captureCurrentSource: () => NoteSource | null;
  /** A new private Markdown note. `source: null` makes a personal note even on a reader page. */
  createJournalNote: (options?: { journalDate?: string; source?: NoteSource | null }) => Promise<string | null>;
  /** Per-user pending text and save state for Markdown notes. */
  journalOutbox: JournalOutbox;
};

const InsightBuilderContext = createContext<InsightBuilderContextValue | null>(null);
const ACTIVE_DRAFT_STORAGE_PREFIX = "vt_reader_active_draft_v1";
const PANEL_OPEN_STORAGE_PREFIX = "vt_notebook_panel_open_v1";
const NO_DRAFTS: InsightDraftSummary[] = [];

type DraftId = Id<"insightDrafts">;
type BlockId = Id<"insightDraftBlocks">;

export function InsightBuilderProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { ready: convexReady } = useConvexSignedIn();
  const canUseInsights = !!user;
  // Per-user queries wait until Convex has accepted the session token, not just the app session.
  const canQuery = canUseInsights && convexReady;
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const activeDraftStorageKey = useMemo(
    () => (user?.id ? `${ACTIVE_DRAFT_STORAGE_PREFIX}:${user.id}` : null),
    [user?.id]
  );
  const panelStorageKey = useMemo(() => (user?.id ? `${PANEL_OPEN_STORAGE_PREFIX}:${user.id}` : null), [user?.id]);
  const hasRestoredActiveDraftRef = useRef(false);
  const hasRestoredPanelRef = useRef(false);

  const draftRows = useQuery(api.insights.listMyDrafts, canQuery ? {} : "skip") as
    | InsightDraftSummary[]
    | undefined;
  const activeDraft = useQuery(
    api.insights.getDraft,
    canQuery && activeDraftId ? ({ draftId: activeDraftId as DraftId }) : "skip"
  ) as InsightDraft | null | undefined;

  const setActiveDraftMutation = useMutation(api.insights.setActiveDraft);
  const renameDraftMutation = useMutation(api.insights.renameDraft);
  const saveDraftSettingsMutation = useMutation(api.insights.saveDraftSettings);
  const deleteDraftMutation = useMutation(api.insights.deleteDraft);
  const addBlockMutation = useMutation(api.insights.addBlock);
  const appendScriptureBlockMutation = useMutation(api.insights.appendScriptureBlock);
  const updateBlockMutation = useMutation(api.insights.updateBlock);
  const removeBlockMutation = useMutation(api.insights.removeBlock);
  const reorderBlocksMutation = useMutation(api.insights.reorderBlocks);
  const publishDraftMutation = useMutation(api.insights.publishDraft);
  const createJournalNoteMutation = useMutation(api.insights.createJournalNote);
  const saveJournalNoteMutation = useMutation(api.insights.saveJournalNote);

  // Saves go through a ref so the outbox, created once per user, always uses the current mutation and
  // refuses to save on behalf of someone who has since signed out or switched accounts.
  const userId = user?.id ?? null;
  const userIdRef = useRef(userId);
  const saveJournalNoteRef = useRef(saveJournalNoteMutation);
  useEffect(() => {
    userIdRef.current = userId;
    saveJournalNoteRef.current = saveJournalNoteMutation;
  }, [userId, saveJournalNoteMutation]);
  const journalOutbox = useMemo(() => {
    const owner = userId;
    return new JournalOutbox(async (noteId, markdownBody, expectedRevision) => {
      if (!owner || userIdRef.current !== owner) throw new Error("You were signed out before this note was saved.");
      try {
        const result = await saveJournalNoteRef.current({ draftId: noteId as DraftId, markdownBody, expectedRevision });
        return { markdownRevision: result.markdownRevision };
      } catch (error) {
        const data = error instanceof ConvexError ? (error.data as { code?: string; currentRevision?: number }) : null;
        if (data?.code === "REVISION_CONFLICT") {
          throw new RevisionConflictError(typeof data.currentRevision === "number" ? data.currentRevision : null);
        }
        throw error;
      }
    });
  }, [userId]);

  // Unsaved note text lives only in this tab, so leaving with some still pending asks first.
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!journalOutbox.hasUnsaved()) return;
      journalOutbox.flushAll();
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [journalOutbox]);

  const [currentSource, setCurrentSource] = useState<RegisteredNoteSource | null>(null);
  const sourceTokenRef = useRef(0);
  const currentSourceRef = useRef<RegisteredNoteSource | null>(null);
  useEffect(() => {
    currentSourceRef.current = currentSource;
  }, [currentSource]);

  const registerNoteSource = useCallback((source: RegisteredNoteSource) => {
    const token = ++sourceTokenRef.current;
    setCurrentSource(source);
    return () => {
      // A newer page may already have registered; only the latest registration clears.
      if (sourceTokenRef.current === token) setCurrentSource(null);
    };
  }, []);

  const captureCurrentSource = useCallback((): NoteSource | null => {
    const registered = currentSourceRef.current;
    if (!registered) return null;
    let href = registered.href;
    if (typeof window !== "undefined") {
      const { pathname, search, hash } = window.location;
      if (!href || href.split(/[?#]/)[0] === pathname) href = `${pathname}${search}${hash}`;
    }
    const label = registered.label.trim().slice(0, 200);
    if (!href || !isSafeSourceHref(href) || !label) return null;
    const source: NoteSource = { kind: registered.kind, label, href };
    if (registered.volume) source.volume = registered.volume;
    if (registered.book) source.book = registered.book;
    if (registered.chapter !== undefined) source.chapter = registered.chapter;
    if (registered.verseStart !== undefined) source.verseStart = registered.verseStart;
    if (registered.verseEnd !== undefined) source.verseEnd = registered.verseEnd;
    return source;
  }, []);

  const drafts = draftRows ?? NO_DRAFTS;
  const isLoading = canUseInsights && (draftRows === undefined || (activeDraftId !== null && activeDraft === undefined));

  useEffect(() => {
    hasRestoredActiveDraftRef.current = false;
    hasRestoredPanelRef.current = false;
  }, [activeDraftStorageKey]);

  useEffect(() => {
    if (!canUseInsights) return;
    if (!activeDraftStorageKey || !panelStorageKey) return;
    if (draftRows === undefined) return;
    if (hasRestoredActiveDraftRef.current) return;

    hasRestoredActiveDraftRef.current = true;
    if (typeof window === "undefined") return;
    let restoredDraftId: string | null = null;
    try {
      const raw = window.localStorage.getItem(activeDraftStorageKey);
      const stored = raw?.trim() ?? "";
      if (stored && draftRows.some((d) => d.id === stored)) restoredDraftId = stored;
    } catch {
      // ignore storage errors
    }
    if (!activeDraftId && restoredDraftId) setActiveDraftId(restoredDraftId);

    // The panel remembers whether it was expanded; someone who has never
    // collapsed it sees it expanded only when a note is already active.
    const hadNote = Boolean(activeDraftId || restoredDraftId);
    try {
      const rawPanel = window.localStorage.getItem(panelStorageKey);
      setIsPanelOpen(rawPanel === null ? hadNote : rawPanel === "1");
    } catch {
      setIsPanelOpen(hadNote);
    }
    hasRestoredPanelRef.current = true;
  }, [canUseInsights, activeDraftStorageKey, panelStorageKey, draftRows, activeDraftId]);

  useEffect(() => {
    if (!activeDraftStorageKey) return;
    if (!hasRestoredActiveDraftRef.current) return;
    if (typeof window === "undefined") return;
    try {
      if (activeDraftId) window.localStorage.setItem(activeDraftStorageKey, activeDraftId);
      else window.localStorage.removeItem(activeDraftStorageKey);
    } catch {
      // ignore storage errors
    }
  }, [activeDraftId, activeDraftStorageKey]);

  useEffect(() => {
    if (!panelStorageKey || !hasRestoredPanelRef.current || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(panelStorageKey, isPanelOpen ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [isPanelOpen, panelStorageKey]);

  useEffect(() => {
    if (!canUseInsights) {
      setActiveDraftId(null);
      setIsMobileOpen(false);
      return;
    }
    if (draftRows === undefined) return;
    if (!activeDraftId) return;
    if (draftRows.some((d) => d.id === activeDraftId)) return;
    setActiveDraftId(null);
  }, [canUseInsights, draftRows, activeDraftId]);

  const openBuilder = useCallback(() => {
    setIsMobileOpen(true);
    setIsPanelOpen(true);
  }, []);

  const closeBuilder = useCallback(() => {
    setIsMobileOpen(false);
    setIsPanelOpen(false);
  }, []);

  const toggleMobileBuilder = useCallback(() => {
    setIsMobileOpen((prev) => !prev);
  }, []);

  const togglePanel = useCallback(() => {
    setIsPanelOpen((prev) => !prev);
  }, []);

  const dismissMobile = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  const activeNote = useMemo<JournalNoteDocument | null>(() => {
    if (!activeDraft) return null;
    const draft = activeDraft as InsightDraft & Partial<JournalNoteDocument>;
    // An older backend without Markdown fields leaves the note unavailable to the Markdown editor.
    if (typeof draft.markdown_body !== "string" || typeof draft.markdown_revision !== "number") return null;
    return {
      id: draft.id,
      title: draft.title,
      status: draft.status,
      markdown_body: draft.markdown_body,
      markdown_revision: draft.markdown_revision,
      markdown_canonical: draft.markdown_canonical ?? false,
      journal_date: draft.journal_date ?? draft.created_at.slice(0, 10),
      source: draft.source ?? null,
      created_at: draft.created_at,
      updated_at: draft.updated_at,
    };
  }, [activeDraft]);

  // Every write to a note passes through here so the UI can show one honest
  // "Saving... / Saved just now" line instead of per-field spinners.
  const tracked = useCallback(async <T,>(work: Promise<T>): Promise<T> => {
    setPendingSaves((n) => n + 1);
    try {
      const result = await work;
      setLastSavedAt(Date.now());
      return result;
    } finally {
      setPendingSaves((n) => Math.max(0, n - 1));
    }
  }, []);
  const saveStatus: NoteSaveStatus = pendingSaves > 0 ? "saving" : lastSavedAt ? "saved" : "idle";

  const createJournalNote = useCallback(
    async (options?: { journalDate?: string; source?: NoteSource | null }) => {
      if (!canUseInsights) return null;
      const source = options?.source === undefined ? captureCurrentSource() : options.source;
      const created = await tracked(
        createJournalNoteMutation({
          journalDate: options?.journalDate ?? localDateKey(),
          source: source ?? undefined,
        })
      );
      const id = String(created.id);
      setActiveDraftId(id);
      setIsPanelOpen(true);
      await setActiveDraftMutation({ draftId: created.id as DraftId });
      return id;
    },
    [canUseInsights, captureCurrentSource, createJournalNoteMutation, setActiveDraftMutation, tracked]
  );

  // Kept for every existing caller (reader, dictionary, notebook). New notes are Markdown journal notes for
  // today, tied to the page they were started from; the title comes from the note's first line, so the
  // old title argument no longer applies.
  const createDraft = useCallback(async () => createJournalNote(), [createJournalNote]);

  const ensureActiveDraftId = useCallback(async () => {
    if (activeDraftId) return activeDraftId;
    const createdId = await createDraft();
    return createdId;
  }, [activeDraftId, createDraft]);

  const switchDraft = useCallback(
    async (draftId: string) => {
      setActiveDraftId(draftId);
      await setActiveDraftMutation({ draftId: draftId as DraftId });
    },
    [setActiveDraftMutation]
  );

  const clearActiveDraft = useCallback(() => {
    setActiveDraftId(null);
  }, []);

  const renameDraft = useCallback(
    async (draftId: string, title: string) => {
      await tracked(renameDraftMutation({ draftId: draftId as DraftId, title }));
    },
    [renameDraftMutation, tracked]
  );

  const deleteDraft = useCallback(
    async (draftId: string) => {
      await tracked(deleteDraftMutation({ draftId: draftId as DraftId }));
      if (activeDraftId === draftId) setActiveDraftId(null);
    },
    [deleteDraftMutation, activeDraftId, tracked]
  );

  const saveDraftSettings = useCallback(
    async (payload: { draftId: string; title?: string; tags?: string[]; visibility?: InsightVisibility }) => {
      await tracked(
        saveDraftSettingsMutation({
          draftId: payload.draftId as DraftId,
          title: payload.title?.trim() || undefined,
          tags: payload.tags?.map((tag) => tag.trim()).filter(Boolean) ?? undefined,
          visibility: payload.visibility,
        })
      );
    },
    [saveDraftSettingsMutation, tracked]
  );

  const addTextBlock = useCallback(
    async (text?: string) => {
      const draftId = await ensureActiveDraftId();
      if (!draftId) return;
      await tracked(
        addBlockMutation({
          draftId: draftId as DraftId,
          type: "text",
          text: text?.trim() || undefined,
        })
      );
      setIsMobileOpen(true);
      setIsPanelOpen(true);
    },
    [addBlockMutation, ensureActiveDraftId, tracked]
  );

  const addQuoteBlock = useCallback(
    async (text?: string, linkUrl?: string, options?: { highlightText?: string; highlightWordIndices?: number[] }) => {
      const draftId = await ensureActiveDraftId();
      if (!draftId) return;
      await tracked(
        addBlockMutation({
          draftId: draftId as DraftId,
          type: "quote",
          text: text?.trim() || undefined,
          highlightText: options?.highlightText?.trim() || undefined,
          highlightWordIndices: options?.highlightWordIndices,
          linkUrl: linkUrl?.trim() || undefined,
        })
      );
      setIsMobileOpen(true);
      setIsPanelOpen(true);
    },
    [addBlockMutation, ensureActiveDraftId, tracked]
  );

  const appendScriptureBlock = useCallback(
    async (payload: ScripturePayload) => {
      const draftId = await ensureActiveDraftId();
      if (!draftId) return;
      await tracked(
        appendScriptureBlockMutation({
          draftId: draftId as DraftId,
          volume: payload.volume,
          book: payload.book,
          chapter: payload.chapter,
          verseStart: payload.verseStart,
          verseEnd: payload.verseEnd,
          reference: payload.reference,
          text: payload.text?.trim() || undefined,
        })
      );
      setIsMobileOpen(true);
      setIsPanelOpen(true);
    },
    [appendScriptureBlockMutation, ensureActiveDraftId, tracked]
  );

  const addDictionaryBlock = useCallback(
    async (payload: DictionaryPayload) => {
      const draftId = await ensureActiveDraftId();
      if (!draftId) return;
      await tracked(
        addBlockMutation({
          draftId: draftId as DraftId,
          type: "dictionary",
          text: payload.entryText?.trim() || undefined,
          dictionaryMeta: {
            edition: payload.edition,
            word: payload.word?.trim() || "Dictionary entry",
            heading: payload.heading?.trim() || undefined,
            pronounce: payload.pronounce?.trim() || undefined,
          },
        })
      );
      setIsMobileOpen(true);
      setIsPanelOpen(true);
    },
    [addBlockMutation, ensureActiveDraftId, tracked]
  );

  const updateBlock = useCallback(
    async (
      blockId: string,
      patch: {
        text?: string;
        linkUrl?: string;
        highlightText?: string;
        highlightWordIndices?: number[];
        dictionaryMeta?: {
          edition: "1828" | "1844" | "1913" | "ETY";
          word: string;
          heading?: string | null;
          pronounce?: string | null;
        };
      }
    ) => {
      await tracked(
        updateBlockMutation({
          blockId: blockId as BlockId,
          text: patch.text?.trim() || undefined,
          highlightText: patch.highlightText?.trim() || undefined,
          highlightWordIndices: patch.highlightWordIndices,
          linkUrl: patch.linkUrl?.trim() || undefined,
          dictionaryMeta: patch.dictionaryMeta
            ? {
                edition: patch.dictionaryMeta.edition,
                word: patch.dictionaryMeta.word?.trim() || "Dictionary entry",
                heading: patch.dictionaryMeta.heading?.trim() || undefined,
                pronounce: patch.dictionaryMeta.pronounce?.trim() || undefined,
              }
            : undefined,
        })
      );
    },
    [updateBlockMutation, tracked]
  );

  const removeBlock = useCallback(
    async (blockId: string) => {
      await tracked(removeBlockMutation({ blockId: blockId as BlockId }));
    },
    [removeBlockMutation, tracked]
  );

  const reorderBlocks = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!activeDraft || fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0) return;
      const ordered = [...activeDraft.blocks].sort((a, b) => a.order - b.order);
      if (fromIndex >= ordered.length || toIndex >= ordered.length) return;
      const [moved] = ordered.splice(fromIndex, 1);
      ordered.splice(toIndex, 0, moved);
      await tracked(
        reorderBlocksMutation({
          draftId: activeDraft.id as DraftId,
          blockIds: ordered.map((b) => b.id as BlockId),
        })
      );
    },
    [activeDraft, reorderBlocksMutation, tracked]
  );

  const publishDraft = useCallback(
    async (title?: string, summary?: string) => {
      if (!activeDraftId) return;
      await tracked(
        publishDraftMutation({
          draftId: activeDraftId as DraftId,
          title: title?.trim() || undefined,
          summary: summary?.trim() || undefined,
        })
      );
      setActiveDraftId(null);
      setIsMobileOpen(false);
    },
    [activeDraftId, publishDraftMutation, tracked]
  );

  const value = useMemo<InsightBuilderContextValue>(
    () => ({
      canUseInsights,
      isMobileOpen,
      isPanelOpen,
      openBuilder,
      closeBuilder,
      toggleMobileBuilder,
      togglePanel,
      saveStatus,
      lastSavedAt,
      drafts,
      activeDraftId,
      activeDraft: activeDraft ?? null,
      isLoading,
      createDraft,
      switchDraft,
      clearActiveDraft,
      renameDraft,
      saveDraftSettings,
      deleteDraft,
      addTextBlock,
      addQuoteBlock,
      addDictionaryBlock,
      appendScriptureBlock,
      updateBlock,
      removeBlock,
      reorderBlocks,
      publishDraft,
      dismissMobile,
      activeNote,
      currentSource,
      registerNoteSource,
      captureCurrentSource,
      createJournalNote,
      journalOutbox,
    }),
    [
      dismissMobile,
      activeNote,
      currentSource,
      registerNoteSource,
      captureCurrentSource,
      createJournalNote,
      journalOutbox,
      canUseInsights,
      isMobileOpen,
      isPanelOpen,
      openBuilder,
      closeBuilder,
      toggleMobileBuilder,
      togglePanel,
      saveStatus,
      lastSavedAt,
      drafts,
      activeDraftId,
      activeDraft,
      isLoading,
      createDraft,
      switchDraft,
      clearActiveDraft,
      renameDraft,
      saveDraftSettings,
      deleteDraft,
      addTextBlock,
      addQuoteBlock,
      addDictionaryBlock,
      appendScriptureBlock,
      updateBlock,
      removeBlock,
      reorderBlocks,
      publishDraft,
    ]
  );

  return <InsightBuilderContext.Provider value={value}>{children}</InsightBuilderContext.Provider>;
}

export function useInsightBuilder() {
  const ctx = useContext(InsightBuilderContext);
  if (!ctx) throw new Error("useInsightBuilder must be used within InsightBuilderProvider");
  return ctx;
}

/** The pending text and save state for one note; re-renders only the caller when the outbox changes. */
export function useNoteOutboxEntry(outbox: JournalOutbox, noteId: string | null): OutboxEntry | undefined {
  const snapshot = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getSnapshot);
  return noteId ? snapshot.get(noteId) : undefined;
}
