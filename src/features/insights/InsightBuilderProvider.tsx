"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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

type InsightBuilderContextValue = {
  canUseInsights: boolean;
  isMobileOpen: boolean;
  openBuilder: () => void;
  closeBuilder: () => void;
  toggleMobileBuilder: () => void;
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

export function InsightBuilderProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const canUseInsights = !!user;
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

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
  }, []);

  const closeBuilder = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  const toggleMobileBuilder = useCallback(() => {
    setIsMobileOpen((prev) => !prev);
  }, []);

  const createDraft = useCallback(
    async (title?: string) => {
      if (!canUseInsights) return null;
      const created = await createDraftMutation({ title: title?.trim() || undefined });
      const id = String(created.id);
      setActiveDraftId(id);
      await setActiveDraftMutation({ draftId: created.id as any });
      return id;
    },
    [canUseInsights, createDraftMutation, setActiveDraftMutation]
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
      await renameDraftMutation({ draftId: draftId as any, title });
    },
    [renameDraftMutation]
  );

  const deleteDraft = useCallback(
    async (draftId: string) => {
      await deleteDraftMutation({ draftId: draftId as any });
      if (activeDraftId === draftId) setActiveDraftId(null);
    },
    [deleteDraftMutation, activeDraftId]
  );

  const saveDraftSettings = useCallback(
    async (payload: { draftId: string; title?: string; tags?: string[]; visibility?: InsightVisibility }) => {
      await saveDraftSettingsMutation({
        draftId: payload.draftId as any,
        title: payload.title?.trim() || undefined,
        tags: payload.tags?.map((tag) => tag.trim()).filter(Boolean) ?? undefined,
        visibility: payload.visibility,
      });
    },
    [saveDraftSettingsMutation]
  );

  const addTextBlock = useCallback(
    async (text?: string) => {
      const draftId = await ensureActiveDraftId();
      if (!draftId) return;
      await addBlockMutation({
        draftId: draftId as any,
        type: "text",
        text: text?.trim() || undefined,
      });
      setIsMobileOpen(true);
    },
    [addBlockMutation, ensureActiveDraftId]
  );

  const addQuoteBlock = useCallback(
    async (text?: string, linkUrl?: string, options?: { highlightText?: string; highlightWordIndices?: number[] }) => {
      const draftId = await ensureActiveDraftId();
      if (!draftId) return;
      await addBlockMutation({
        draftId: draftId as any,
        type: "quote",
        text: text?.trim() || undefined,
        highlightText: options?.highlightText?.trim() || undefined,
        highlightWordIndices: options?.highlightWordIndices,
        linkUrl: linkUrl?.trim() || undefined,
      });
      setIsMobileOpen(true);
    },
    [addBlockMutation, ensureActiveDraftId]
  );

  const appendScriptureBlock = useCallback(
    async (payload: ScripturePayload) => {
      const draftId = await ensureActiveDraftId();
      if (!draftId) return;
      await appendScriptureBlockMutation({
        draftId: draftId as any,
        volume: payload.volume,
        book: payload.book,
        chapter: payload.chapter,
        verseStart: payload.verseStart,
        verseEnd: payload.verseEnd,
        reference: payload.reference,
        text: payload.text?.trim() || undefined,
      });
      setIsMobileOpen(true);
    },
    [appendScriptureBlockMutation, ensureActiveDraftId]
  );

  const addDictionaryBlock = useCallback(
    async (payload: DictionaryPayload) => {
      const draftId = await ensureActiveDraftId();
      if (!draftId) return;
      await addBlockMutation({
        draftId: draftId as any,
        type: "dictionary",
        text: payload.entryText?.trim() || undefined,
        dictionaryMeta: {
          edition: payload.edition,
          word: payload.word?.trim() || "Dictionary entry",
          heading: payload.heading?.trim() || undefined,
          pronounce: payload.pronounce?.trim() || undefined,
        },
      });
      setIsMobileOpen(true);
    },
    [addBlockMutation, ensureActiveDraftId]
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
      await updateBlockMutation({
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
      });
    },
    [updateBlockMutation]
  );

  const removeBlock = useCallback(
    async (blockId: string) => {
      await removeBlockMutation({ blockId: blockId as any });
    },
    [removeBlockMutation]
  );

  const reorderBlocks = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!activeDraft || fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0) return;
      const ordered = [...activeDraft.blocks].sort((a, b) => a.order - b.order);
      if (fromIndex >= ordered.length || toIndex >= ordered.length) return;
      const [moved] = ordered.splice(fromIndex, 1);
      ordered.splice(toIndex, 0, moved);
      await reorderBlocksMutation({
        draftId: activeDraft.id as any,
        blockIds: ordered.map((b) => b.id as any),
      });
    },
    [activeDraft, reorderBlocksMutation]
  );

  const publishDraft = useCallback(
    async (title?: string, summary?: string) => {
      if (!activeDraftId) return;
      await publishDraftMutation({
        draftId: activeDraftId as any,
        title: title?.trim() || undefined,
        summary: summary?.trim() || undefined,
      });
      setActiveDraftId(null);
      setIsMobileOpen(false);
    },
    [activeDraftId, publishDraftMutation]
  );

  const value = useMemo<InsightBuilderContextValue>(
    () => ({
      canUseInsights,
      isMobileOpen,
      openBuilder,
      closeBuilder,
      toggleMobileBuilder,
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
      openBuilder,
      closeBuilder,
      toggleMobileBuilder,
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
