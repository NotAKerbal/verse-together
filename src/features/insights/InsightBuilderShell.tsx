"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { useRouter } from "next/navigation";
import type { InsightDraftBlock } from "@/lib/appData";
import { useInsightBuilder } from "./InsightBuilderProvider";
import { QuoteBlockEditor, ScriptureBlockEditor, TextBlockEditor } from "./InsightBlockEditors";

function blockLabel(type: InsightDraftBlock["type"]) {
  if (type === "scripture") return "Scripture";
  if (type === "quote") return "Quote";
  return "Text";
}

function BlockCard({
  block,
  dragId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onRemove,
  onSave,
}: {
  block: InsightDraftBlock;
  dragId: string | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: ReactDragEvent<HTMLLIElement>) => void;
  onDrop: () => void;
  onRemove: () => void;
  onSave: (patch: { text?: string; linkUrl?: string; highlightText?: string; highlightWordIndices?: number[] }) => Promise<void>;
}) {
  const [text, setText] = useState(block.text ?? "");
  const [linkUrl, setLinkUrl] = useState(block.link_url ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(block.text ?? "");
    setLinkUrl(block.link_url ?? "");
  }, [block.id, block.text, block.link_url]);

  async function saveIfChanged() {
    if (saving) return;
    const nextText = text.trim();
    const nextLink = linkUrl.trim();
    const currentText = (block.text ?? "").trim();
    const currentLink = (block.link_url ?? "").trim();
    if (nextText === currentText && nextLink === currentLink) return;
    setSaving(true);
    try {
      await onSave({
        text,
        linkUrl: block.type === "quote" ? linkUrl : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const title =
    block.type === "scripture" ? block.scripture_ref?.reference ?? "Scripture" : blockLabel(block.type);

  return (
    <li
      onDragOver={onDragOver}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      }}
      className={`rounded-md border border-black/10 dark:border-white/15 p-3 space-y-2 bg-background/70 ${dragId === block.id ? "opacity-60" : ""}`}
    >
      <div className="relative flex items-center justify-between gap-2">
        <span className="min-w-0 pr-10 text-xs font-medium text-foreground/70 truncate">{title}</span>
        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="absolute left-1/2 -translate-x-1/2 flex cursor-grab active:cursor-grabbing items-center justify-center px-1"
          title="Drag to reorder"
          aria-label="Drag block"
        >
          <div className="h-1.5 w-8 rounded-full bg-foreground/20" />
        </div>
        <button
          onClick={onRemove}
          className="text-foreground/50 hover:text-red-600 text-sm leading-none px-1"
          title="Remove block"
          aria-label="Remove block"
        >
          ×
        </button>
      </div>
      <div onBlur={block.type === "scripture" ? undefined : saveIfChanged}>
        {block.type === "scripture" ? (
          <ScriptureBlockEditor
            block={{ ...block, text }}
            onTextChange={() => {}}
            onLinkChange={() => {}}
            onHighlightWordsChange={async (highlightWordIndices) => {
              setSaving(true);
              try {
                const selectedWords = (text ?? "")
                  .split(/\s+/)
                  .filter(Boolean)
                  .filter((_, idx) => highlightWordIndices.includes(idx))
                  .join(" ");
                await onSave({
                  highlightWordIndices,
                  highlightText: selectedWords || "",
                });
              } finally {
                setSaving(false);
              }
            }}
          />
        ) : null}
        {block.type === "text" ? (
          <TextBlockEditor block={{ ...block, text }} onTextChange={(value) => setText(value)} onLinkChange={() => {}} />
        ) : null}
        {block.type === "quote" ? (
          <QuoteBlockEditor
            block={{ ...block, text, link_url: linkUrl }}
            onTextChange={(value) => setText(value)}
            onLinkChange={(value) => setLinkUrl(value)}
          />
        ) : null}
      </div>
      {saving ? <div className="text-[11px] text-foreground/60">Saving…</div> : null}
    </li>
  );
}

function BuilderContent() {
  const {
    drafts,
    activeDraftId,
    activeDraft,
    isLoading,
    createDraft,
    switchDraft,
    renameDraft,
    deleteDraft,
    addTextBlock,
    addQuoteBlock,
    updateBlock,
    removeBlock,
    reorderBlocks,
  } = useInsightBuilder();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const didDropRef = useRef(false);

  useEffect(() => {
    setTitle(activeDraft?.title ?? "");
    setSavedMessage("");
  }, [activeDraft?.id, activeDraft?.title]);

  const orderedBlocks = useMemo(
    () => (activeDraft?.blocks ? [...activeDraft.blocks].sort((a, b) => a.order - b.order) : []),
    [activeDraft?.blocks]
  );

  async function onCreateDraft() {
    setBusy(true);
    try {
      await createDraft();
    } finally {
      setBusy(false);
    }
  }

  async function onRenameDraft() {
    if (!activeDraftId) return;
    const next = title.trim();
    if (!next) return;
    if (next === (activeDraft?.title ?? "").trim()) return;
    await renameDraft(activeDraftId, next);
  }

  async function onDeleteDraft() {
    if (!activeDraftId) return;
    const sure = window.confirm("Delete this draft?");
    if (!sure) return;
    setBusy(true);
    try {
      await deleteDraft(activeDraftId);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveDraft() {
    if (!activeDraftId) return;
    setBusy(true);
    try {
      await onRenameDraft();
      setSavedMessage("Saved");
      window.setTimeout(() => setSavedMessage(""), 1200);
    } finally {
      setBusy(false);
    }
  }

  function onGoToPublish() {
    if (!activeDraftId) return;
    router.push(`/insights/publish/${activeDraftId}`);
  }

  function setDragState(nextDragId: string | null, nextDropIndex: number | null) {
    dragIdRef.current = nextDragId;
    dropIndexRef.current = nextDropIndex;
    setDragId(nextDragId);
    setDropIndex(nextDropIndex);
  }

  function commitDrop() {
    const draggingId = dragIdRef.current;
    const insertionIndex = dropIndexRef.current;
    if (!draggingId || insertionIndex === null) return;
    const from = orderedBlocks.findIndex((b) => b.id === draggingId);
    if (from < 0) {
      setDragState(null, null);
      return;
    }
    const insertion = Math.max(0, Math.min(insertionIndex, orderedBlocks.length));
    const to = from < insertion ? insertion - 1 : insertion;
    if (to !== from && to >= 0 && to < orderedBlocks.length) {
      void reorderBlocks(from, to);
    }
    setDragState(null, null);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-black/10 dark:border-white/15 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Insight Builder</h2>
          <button
            onClick={onCreateDraft}
            disabled={busy}
            className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
          >
            + Draft
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {drafts.filter((d) => d.status === "draft").map((draft) => (
            <button
              key={draft.id}
              onClick={() => switchDraft(draft.id)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
                draft.id === activeDraftId
                  ? "border-foreground text-foreground"
                  : "border-black/10 dark:border-white/15 text-foreground/75"
              }`}
            >
              {draft.title}
            </button>
          ))}
          {drafts.filter((d) => d.status === "draft").length === 0 ? (
            <span className="text-xs text-foreground/60">No drafts yet.</span>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading ? <p className="text-sm text-foreground/60">Loading insight draft…</p> : null}
        {!isLoading && !activeDraft ? (
          <p className="text-sm text-foreground/70">
            Start an insight by tapping a scripture, or create a blank draft here.
          </p>
        ) : null}
        {activeDraft ? (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={onRenameDraft}
              className="w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm font-medium"
              placeholder="Insight title"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => addTextBlock("")}
                className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-xs"
              >
                + Text
              </button>
              <button
                onClick={() => addQuoteBlock("", "")}
                className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-xs"
              >
                + Quote
              </button>
              <button
                onClick={onDeleteDraft}
                className="rounded-md border border-red-200 text-red-700 dark:border-red-400/30 px-2 py-1 text-xs"
              >
                Delete
              </button>
            </div>
            <ul
              className="space-y-2"
              onDragOver={(event) => {
                event.preventDefault();
                if (!dragIdRef.current) return;
                if (event.target !== event.currentTarget) return;
                setDragState(dragIdRef.current, orderedBlocks.length);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (event.target !== event.currentTarget) return;
                didDropRef.current = true;
                commitDrop();
              }}
            >
              {orderedBlocks.map((block, index) => (
                <div key={block.id} className="space-y-2">
                  {dragId && dropIndex === index ? (
                    <li className="rounded-md border border-dashed border-sky-500/60 bg-sky-500/10 h-12" />
                  ) : null}
                  <BlockCard
                    block={block}
                    dragId={dragId}
                    onDragStart={() => {
                      didDropRef.current = false;
                      setDragState(block.id, index);
                    }}
                    onDragEnd={() => {
                      window.setTimeout(() => {
                        if (didDropRef.current) {
                          didDropRef.current = false;
                          return;
                        }
                        setDragState(null, null);
                      }, 0);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!dragIdRef.current) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const before = event.clientY < rect.top + rect.height / 2;
                      setDragState(dragIdRef.current, before ? index : index + 1);
                    }}
                    onDrop={() => {
                      didDropRef.current = true;
                      commitDrop();
                    }}
                    onRemove={() => removeBlock(block.id)}
                    onSave={(patch) => updateBlock(block.id, patch)}
                  />
                </div>
              ))}
              {dragId && dropIndex === orderedBlocks.length ? (
                <li className="rounded-md border border-dashed border-sky-500/60 bg-sky-500/10 h-12" />
              ) : null}
            </ul>
            <div className="space-y-2 pt-2 border-t border-black/10 dark:border-white/15">
              <button
                onClick={onSaveDraft}
                disabled={busy}
                className="w-full rounded-md bg-foreground text-background px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                Save
              </button>
              <button
                onClick={onGoToPublish}
                disabled={busy || orderedBlocks.length === 0}
                className="w-full rounded-md border border-black/10 dark:border-white/15 px-3 py-2 text-sm disabled:opacity-60"
              >
                Publish insight
              </button>
              {savedMessage ? <p className="text-xs text-foreground/70 text-center">{savedMessage}</p> : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function InsightBuilderShell() {
  const { canUseInsights, isMobileOpen, toggleMobileBuilder, closeBuilder } = useInsightBuilder();

  if (!canUseInsights) return null;

  return (
    <>
      <button
        onClick={toggleMobileBuilder}
        className="lg:hidden fixed z-50 right-4 bottom-4 rounded-full bg-foreground text-background px-4 py-3 text-sm font-medium shadow-lg"
      >
        {isMobileOpen ? "Close Insight" : "Open Insight"}
      </button>

      {isMobileOpen ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <button aria-label="Close insight builder" onClick={closeBuilder} className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-x-2 bottom-0 max-h-[85vh] rounded-t-2xl border border-black/10 dark:border-white/15 bg-background shadow-2xl overflow-hidden">
            <BuilderContent />
          </div>
        </div>
      ) : null}

      <aside className="hidden lg:block fixed right-0 top-16 bottom-0 z-40 w-[360px] border-l border-black/10 dark:border-white/15 bg-background/95 backdrop-blur">
        <BuilderContent />
      </aside>
    </>
  );
}
