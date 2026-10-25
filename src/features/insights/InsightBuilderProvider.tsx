"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
} from "react";
import { useMutation, useQueries, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/lib/auth";
import type { InsightDraft, InsightDraftSummary, InsightVisibility } from "@/lib/appData";
import { isSafeSourceHref, localDateKey, type JournalNoteDocument, type NoteSource } from "@/features/notes/journal";
import { JournalOutbox, RevisionConflictError, type OutboxEntry } from "@/features/notes/journalOutbox";
import { useConvexSignedIn } from "@/features/notes/useConvexSignedIn";
import type { ReadingLogOption } from "@/features/notes/ReadingChip";
import {
  entryDraftInput,
  entryDraftProblem,
  EntryDraftProblem,
  freshEntryDraft,
  restartEntryDraft,
  type EntryDefaults,
  type EntryDraft,
  type EntryDraftSaveResult,
} from "@/features/notes/entryDraft";
import type { ChapterMarkAttempt } from "@/features/plans/ChapterReadToggle";

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

/** The two views of the notes panel: "log" is the unsaved entry (Log, New note), "notes" the saved ones. */
export type NotebookPanelView = "log" | "notes";

/** The chapter a chapter page is showing, so the panel's Log view can record it. */
export type ReaderChapter = {
  volume: string;
  book: string;
  chapter: number;
  reference: string;
  logOptions: ReadingLogOption[];
  /** The chapter's text has arrived (its verse count is known). */
  logReady: boolean;
};

/** One chapter page's hold on the panel's Log view; see registerReaderChapter. */
export type ReaderChapterRegistration = {
  update: (chapter: ReaderChapter) => void;
  unregister: () => void;
};

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
  panelView: NotebookPanelView;
  setPanelView: (view: NotebookPanelView) => void;
  /** Expands the desktop panel on the given view. */
  openPanel: (view: NotebookPanelView) => void;
  /** Phone Log and Notes sheet, opened from a chapter page's Log button. */
  isSheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  /** The chapter page most recently mounted (a page opening over another wins), or null on other pages. */
  readerChapter: ReaderChapter | null;
  /** Called once per mounted chapter header; update it as the chapter's details change, unregister on unmount. */
  registerReaderChapter: () => ReaderChapterRegistration;
  /**
   * The panel's mark-read toggle's last unfinished attempt. It outlives the panel (collapsing it, closing the
   * sheet) so a retry after an unknown result reuses the request id; cleared when the account changes.
   */
  readerMarkPendingRef: MutableRefObject<ChapterMarkAttempt | null>;
  /**
   * The one unsaved journal entry (Log, New note, a Journal day's New note). It outlives the panel, so closing
   * and reopening keeps its text; it is cleared when the account changes and once it is saved.
   */
  entryDraft: EntryDraft;
  updateEntryDraft: (change: (draft: EntryDraft) => EntryDraft) => void;
  /** Starts the draft from these defaults unless it already holds something, and shows it in the panel. */
  startEntry: (defaults: EntryDefaults) => void;
  /**
   * The header's Log: the entry draft for `source` (logging reading of it), in the phone sheet or desktop panel.
   * Opening is immediate; nothing is stored until the entry is saved.
   */
  openLog: (source: NoteSource | null, surface: "sheet" | "panel") => void;
  /**
   * Saves the draft as one entry and makes it the active note. Throws EntryDraftProblem before sending anything
   * incomplete, and the server's error when the save fails (the draft and its request id are kept for a retry).
   */
  saveEntryDraft: () => Promise<EntryDraftSaveResult>;
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
  const [panelView, setPanelView] = useState<NotebookPanelView>("notes");
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [readerChapter, setReaderChapter] = useState<ReaderChapter | null>(null);
  const readerChaptersRef = useRef(new Map<number, ReaderChapter>());
  const readerChapterTokenRef = useRef(0);
  const readerMarkPendingRef = useRef<ChapterMarkAttempt | null>(null);
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
  // getDraft fails once its note is gone (deleted here or elsewhere). useQueries reports that instead of throwing
  // during render, so a missing note reads as unavailable, like any other note that can't be opened.
  const activeDraftQuery = useMemo(() => {
    const queries: Parameters<typeof useQueries>[0] = {};
    if (canQuery && activeDraftId) {
      queries.draft = { query: api.insights.getDraft, args: { draftId: activeDraftId as DraftId } };
    }
    return queries;
  }, [canQuery, activeDraftId]);
  const activeDraftResult = useQueries(activeDraftQuery).draft as InsightDraft | null | Error | undefined;
  // The note being deleted stays on screen until its deletion settles: the server's answer to the delete and
  // its subscription's failure arrive together, a moment before the active note can be cleared.
  const [deletingDraft, setDeletingDraft] = useState<InsightDraft | null>(null);
  const activeDraft =
    activeDraftResult instanceof Error
      ? deletingDraft && deletingDraft.id === activeDraftId
        ? deletingDraft
        : null
      : activeDraftResult;

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
  const createJournalEntryMutation = useMutation(api.insights.createJournalEntry);
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
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(() => freshEntryDraft());
  const entryDraftRef = useRef(entryDraft);
  useEffect(() => {
    entryDraftRef.current = entryDraft;
  }, [entryDraft]);
  // Another account never sees this one's unsaved entry or reuses its request ids.
  useEffect(() => {
    readerMarkPendingRef.current = null;
    setEntryDraft(freshEntryDraft());
  }, [userId]);
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
      const unsavedEntry = entryDraftRef.current.text.trim() !== "";
      if (!journalOutbox.hasUnsaved() && !unsavedEntry) return;
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
      setSheetOpen(false);
      return;
    }
    if (draftRows === undefined) return;
    if (!activeDraftId) return;
    if (draftRows.some((d) => d.id === activeDraftId)) return;
    setActiveDraftId(null);
  }, [canUseInsights, draftRows, activeDraftId]);

  const openPanel = useCallback((view: NotebookPanelView) => {
    setPanelView(view);
    setIsPanelOpen(true);
  }, []);

  // Everything that writes to or asks for a note shows the Notes view (below lg, the /notes page).
  const openBuilder = useCallback(() => {
    setPanelView("notes");
    setIsMobileOpen(true);
    setIsPanelOpen(true);
  }, []);

  const registerReaderChapter = useCallback((): ReaderChapterRegistration => {
    const token = ++readerChapterTokenRef.current;
    const registered = readerChaptersRef.current;
    const showLatest = () => {
      let latest: ReaderChapter | null = null;
      let latestToken = -1;
      for (const [key, chapter] of registered) {
        if (key > latestToken) {
          latestToken = key;
          latest = chapter;
        }
      }
      setReaderChapter(latest);
    };
    return {
      update: (chapter) => {
        registered.set(token, chapter);
        showLatest();
      },
      unregister: () => {
        registered.delete(token);
        showLatest();
      },
    };
  }, []);

  const closeBuilder = useCallback(() => {
    setIsMobileOpen(false);
    setIsPanelOpen(false);
    setSheetOpen(false);
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
      reading_at: draft.reading_at ?? null,
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
      setPanelView("notes");
      setIsPanelOpen(true);
      await setActiveDraftMutation({ draftId: created.id as DraftId });
      return id;
    },
    [canUseInsights, captureCurrentSource, createJournalNoteMutation, setActiveDraftMutation, tracked]
  );

  const updateEntryDraft = useCallback((change: (draft: EntryDraft) => EntryDraft) => setEntryDraft(change), []);

  const startEntry = useCallback((defaults: EntryDefaults) => {
    setEntryDraft((draft) => restartEntryDraft(draft, defaults));
    setPanelView("log");
  }, []);

  const openLog = useCallback((source: NoteSource | null, surface: "sheet" | "panel") => {
    setEntryDraft((draft) => restartEntryDraft(draft, { source, logReading: !!source }));
    setPanelView("log");
    if (surface === "sheet") setSheetOpen(true);
    else setIsPanelOpen(true);
  }, []);

  const saveEntryDraft = useCallback(async (): Promise<EntryDraftSaveResult> => {
    const draft = entryDraftRef.current;
    const problem = entryDraftProblem(draft);
    if (problem) throw new EntryDraftProblem(problem);
    const owner = userIdRef.current;
    const result = await tracked(createJournalEntryMutation(entryDraftInput(draft)));
    if (!owner || userIdRef.current !== owner) throw new Error("You were signed out before this entry was saved.");
    if (!result.id) {
      // Deleted elsewhere after an earlier attempt landed: keep the text, under a new request, for a new entry.
      setEntryDraft((current) =>
        current.requestId === draft.requestId ? { ...current, requestId: freshEntryDraft().requestId } : current
      );
      return { id: null, deleted: true };
    }
    const id = String(result.id);
    // Clears only the draft it saved. The next Log or New note starts again from its page.
    setEntryDraft((current) => (current.requestId === draft.requestId ? freshEntryDraft({ source: draft.source }) : current));
    setActiveDraftId(id);
    void setActiveDraftMutation({ draftId: result.id as DraftId }).catch(() => {});
    return { id };
  }, [createJournalEntryMutation, setActiveDraftMutation, tracked]);

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

  // Published notes can't be deleted (the server refuses). The outbox holds the note's saves meanwhile and, once
  // it is gone, forgets its text, so no late save or unload warning outlives it.
  const deleteDraft = useCallback(
    async (draftId: string) => {
      if (activeDraft && activeDraft.id === draftId) setDeletingDraft(activeDraft);
      try {
        await journalOutbox.remove(draftId, () => tracked(deleteDraftMutation({ draftId: draftId as DraftId })));
        // Another note may have been chosen while this one was being deleted; that one stays active.
        setActiveDraftId((current) => (current === draftId ? null : current));
      } finally {
        setDeletingDraft((current) => (current?.id === draftId ? null : current));
      }
    },
    [activeDraft, deleteDraftMutation, journalOutbox, tracked]
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
      openBuilder();
    },
    [addBlockMutation, ensureActiveDraftId, openBuilder, tracked]
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
      openBuilder();
    },
    [addBlockMutation, ensureActiveDraftId, openBuilder, tracked]
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
      openBuilder();
    },
    [appendScriptureBlockMutation, ensureActiveDraftId, openBuilder, tracked]
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
      openBuilder();
    },
    [addBlockMutation, ensureActiveDraftId, openBuilder, tracked]
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
      panelView,
      setPanelView,
      openPanel,
      isSheetOpen,
      setSheetOpen,
      readerChapter,
      registerReaderChapter,
      readerMarkPendingRef,
      entryDraft,
      updateEntryDraft,
      startEntry,
      openLog,
      saveEntryDraft,
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
      panelView,
      setPanelView,
      openPanel,
      isSheetOpen,
      setSheetOpen,
      readerChapter,
      registerReaderChapter,
      readerMarkPendingRef,
      entryDraft,
      updateEntryDraft,
      startEntry,
      openLog,
      saveEntryDraft,
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
