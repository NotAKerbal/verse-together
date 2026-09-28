"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/lib/auth";
import type { InsightDraft, InsightDraftSummary, InsightVisibility } from "@/lib/appData";

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
};

const InsightBuilderContext = createContext<InsightBuilderContextValue | null>(null);
const ACTIVE_DRAFT_STORAGE_PREFIX = "vt_reader_active_draft_v1";
const PANEL_OPEN_STORAGE_PREFIX = "vt_notebook_panel_open_v1";

export function InsightBuilderProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const canUseInsights = !!user;
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

  const draftRows = useQuery(api.insights.listMyDrafts, canUseInsights ? {} : "skip") as
    | InsightDraftSummary[]
    | undefined;
  const activeDraft = useQuery(
    api.insights.getDraft,
    canUseInsights && activeDraftId ? ({ draftId: activeDraftId as any }) : "skip"
  ) as InsightDraft | undefined;

  const createDraftMutation = useMutation(api.insights.createDraft);
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

  const drafts = draftRows ?? [];
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

  const createDraft = useCallback(
    async (title?: string) => {
      if (!canUseInsights) return null;
      const created = await tracked(createDraftMutation({ title: title?.trim() || undefined }));
      const id = String(created.id);
      setActiveDraftId(id);
      setIsPanelOpen(true);
      await setActiveDraftMutation({ draftId: created.id as any });
      return id;
    },
    [canUseInsights, createDraftMutation, setActiveDraftMutation, tracked]
  );

  const ensureActiveDraftId = useCallback(async () => {
    if (activeDraftId) return activeDraftId;
    const createdId = await createDraft("New note");
    return createdId;
  }, [activeDraftId, createDraft]);

  const switchDraft = useCallback(
    async (draftId: string) => {
      setActiveDraftId(draftId);
      await setActiveDraftMutation({ draftId: draftId as any });
    },
    [setActiveDraftMutation]
  );

  const clearActiveDraft = useCallback(() => {
    setActiveDraftId(null);
  }, []);

  const renameDraft = useCallback(
    async (draftId: string, title: string) => {
      await tracked(renameDraftMutation({ draftId: draftId as any, title }));
    },
    [renameDraftMutation, tracked]
  );

  const deleteDraft = useCallback(
    async (draftId: string) => {
      await tracked(deleteDraftMutation({ draftId: draftId as any }));
      if (activeDraftId === draftId) setActiveDraftId(null);
    },
    [deleteDraftMutation, activeDraftId, tracked]
  );

  const saveDraftSettings = useCallback(
    async (payload: { draftId: string; title?: string; tags?: string[]; visibility?: InsightVisibility }) => {
      await tracked(
        saveDraftSettingsMutation({
          draftId: payload.draftId as any,
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
          draftId: draftId as any,
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
          draftId: draftId as any,
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
          draftId: draftId as any,
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
          draftId: draftId as any,
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
          blockId: blockId as any,
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
      await tracked(removeBlockMutation({ blockId: blockId as any }));
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
          draftId: activeDraft.id as any,
          blockIds: ordered.map((b) => b.id as any),
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
          draftId: activeDraftId as any,
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
    }),
    [
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
