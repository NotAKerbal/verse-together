"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import type { InsightDraftBlock, InsightVisibility } from "@/lib/appData";
import { useInsightBuilder } from "./InsightBuilderProvider";
import { QuoteBlockEditor, ScriptureBlockEditor, TextBlockEditor } from "./InsightBlockEditors";

function blockLabel(type: InsightDraftBlock["type"]) {
  if (type === "scripture") return "Scripture";
  if (type === "quote") return "Quote";
  return "Text";
}

function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const tag = part.trim().replace(/^#+/, "").toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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
    clearActiveDraft,
    renameDraft,
    saveDraftSettings,
    deleteDraft,
    addTextBlock,
    addQuoteBlock,
    updateBlock,
    removeBlock,
    reorderBlocks,
  } = useInsightBuilder();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [visibility, setVisibility] = useState<InsightVisibility>("private");
  const [origin, setOrigin] = useState("");
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [openDraftIds, setOpenDraftIds] = useState<string[]>([]);
  const [isLoadSavedOpen, setIsLoadSavedOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const tagAutosaveTimeoutRef = useRef<number | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const didDropRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    setTitle(activeDraft?.title ?? "");
    setTagsInput((activeDraft?.tags ?? []).map((tag) => `#${tag}`).join(", "));
    setVisibility(activeDraft?.visibility ?? "private");
    setShareMessage("");
    setIsShareMenuOpen(false);
  }, [activeDraft?.id, activeDraft?.title, activeDraft?.tags, activeDraft?.visibility]);

  useEffect(() => {
    if (!activeDraftId) return;
    if (!activeDraft) return;
    const nextTags = parseTags(tagsInput);
    const currentTags = activeDraft.tags ?? [];
    if (tagsEqual(nextTags, currentTags)) return;

    if (tagAutosaveTimeoutRef.current) {
      window.clearTimeout(tagAutosaveTimeoutRef.current);
    }
    tagAutosaveTimeoutRef.current = window.setTimeout(() => {
      void saveDraftSettings({
        draftId: activeDraftId,
        tags: nextTags,
      });
    }, 700);

    return () => {
      if (tagAutosaveTimeoutRef.current) {
        window.clearTimeout(tagAutosaveTimeoutRef.current);
      }
    };
  }, [tagsInput, activeDraftId, activeDraft, saveDraftSettings]);

  useEffect(() => {
    const draftIds = drafts.filter((d) => d.status === "draft").map((d) => d.id);
    const draftIdSet = new Set(draftIds);
    setOpenDraftIds((prev) => {
      const kept = prev.filter((id) => draftIdSet.has(id));
      const keptSet = new Set(kept);
      const additions = draftIds.filter((id) => !keptSet.has(id));
      return [...kept, ...additions];
    });
  }, [drafts]);

  const orderedBlocks = useMemo(
    () => (activeDraft?.blocks ? [...activeDraft.blocks].sort((a, b) => a.order - b.order) : []),
    [activeDraft?.blocks]
  );
  const openDraftTabs = useMemo(() => {
    const byId = new Map(drafts.filter((d) => d.status === "draft").map((d) => [d.id, d]));
    return openDraftIds
      .map((id) => byId.get(id))
      .filter((draft): draft is (typeof drafts)[number] => Boolean(draft));
  }, [drafts, openDraftIds]);
  const hiddenDraftTabs = useMemo(() => {
    const openSet = new Set(openDraftIds);
    return drafts.filter((d) => d.status === "draft" && !openSet.has(d.id));
  }, [drafts, openDraftIds]);

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
    const sure = window.confirm("Delete this insight?");
    if (!sure) return;
    setBusy(true);
    try {
      await deleteDraft(activeDraftId);
    } finally {
      setBusy(false);
    }
  }

  async function onShareInsight() {
    setIsShareMenuOpen((prev) => !prev);
  }

  async function onCloseTab(draftId: string) {
    const nextTabs = openDraftIds.filter((id) => id !== draftId);
    setOpenDraftIds(nextTabs);
    if (activeDraftId !== draftId) return;
    if (nextTabs.length === 0) {
      clearActiveDraft();
      setIsLoadSavedOpen(true);
      return;
    }
    await switchDraft(nextTabs[0]);
  }

  async function onLoadSaved(draftId: string) {
    setOpenDraftIds((prev) => (prev.includes(draftId) ? prev : [...prev, draftId]));
    await switchDraft(draftId);
    setIsLoadSavedOpen(false);
  }

  async function onSelectVisibility(nextVisibility: InsightVisibility) {
    if (!activeDraftId) return;
    setBusy(true);
    try {
      await saveDraftSettings({
        draftId: activeDraftId,
        title: title.trim() || undefined,
        tags: parseTags(tagsInput),
        visibility: nextVisibility,
      });
      setVisibility(nextVisibility);
      setIsShareMenuOpen(false);
      setShareMessage("Sharing updated");
      window.setTimeout(() => setShareMessage(""), 1200);
    } finally {
      setBusy(false);
    }
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
          <h2 className="text-sm font-semibold">Insights</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLoadSavedOpen((prev) => !prev)}
              className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
            >
              Load insights
            </button>
            <button
              onClick={onCreateDraft}
              disabled={busy}
              className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
            >
              + Insight
            </button>
          </div>
        </div>
        {isLoadSavedOpen ? (
          <div className="rounded-md border border-black/10 dark:border-white/15 p-2 space-y-1 max-h-40 overflow-y-auto">
            {hiddenDraftTabs.length === 0 ? (
              <p className="text-xs text-foreground/60 px-1 py-1">No hidden insights.</p>
            ) : (
              hiddenDraftTabs.map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => void onLoadSaved(draft.id)}
                  className="w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {draft.title}
                </button>
              ))
            )}
          </div>
        ) : null}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {openDraftTabs.map((draft) => (
            <div
              key={draft.id}
              className={`whitespace-nowrap rounded-full border pl-3 pr-1 py-1 text-xs flex items-center gap-1 ${
                draft.id === activeDraftId
                  ? "border-foreground text-foreground"
                  : "border-black/10 dark:border-white/15 text-foreground/75"
              }`}
            >
              <button onClick={() => switchDraft(draft.id)} className="text-left">
                {draft.title}
              </button>
              <button
                onClick={() => void onCloseTab(draft.id)}
                className="hidden lg:inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                title="Close tab"
                aria-label={`Close ${draft.title}`}
              >
                ×
              </button>
            </div>
          ))}
          {openDraftTabs.length === 0 ? (
            <span className="text-xs text-foreground/60">No insights yet.</span>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 pb-0 space-y-3">
        {isLoading ? <p className="text-sm text-foreground/60">Loading insight...</p> : null}
        {!isLoading && !activeDraft ? (
          <p className="text-sm text-foreground/70">
            Start an insight by tapping a scripture, or create a blank insight here.
          </p>
        ) : null}
        {activeDraft ? (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                void onRenameDraft();
              }}
              className="w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm font-medium"
              placeholder="Insight title"
            />
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
                    <li
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        didDropRef.current = true;
                        commitDrop();
                      }}
                      className="rounded-md border border-dashed border-sky-500/60 bg-sky-500/10 h-12"
                    />
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
                <li
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    didDropRef.current = true;
                    commitDrop();
                  }}
                  className="rounded-md border border-dashed border-sky-500/60 bg-sky-500/10 h-12"
                />
              ) : null}
            </ul>
            <div className="flex items-center gap-2 pt-1">
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
                Delete insight
              </button>
            </div>
            <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-black/10 dark:border-white/15 mt-3 -mx-3 px-3 py-3 space-y-2">
              <div className="text-xs font-medium text-foreground/75">Tags</div>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onBlur={() => {
                  if (!activeDraftId || !activeDraft) return;
                  const nextTags = parseTags(tagsInput);
                  const currentTags = activeDraft.tags ?? [];
                  if (tagsEqual(nextTags, currentTags)) return;
                  void saveDraftSettings({
                    draftId: activeDraftId,
                    tags: nextTags,
                  });
                }}
                className="w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
                placeholder="Tags (comma separated)"
              />
              <button
                onClick={onShareInsight}
                disabled={busy}
                className="w-full rounded-md bg-foreground text-background px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                Share
              </button>
              {isShareMenuOpen ? (
                <div className="space-y-2 rounded-md border border-black/10 dark:border-white/15 p-2">
                  <div className="text-xs text-foreground/70">Who can view this insight?</div>
                  {(
                    [
                      {
                        key: "private",
                        title: "Private",
                        description: "Only you can view this insight.",
                      },
                      {
                        key: "friends",
                        title: "Visible to friends",
                        description: "Only friends can open this insight.",
                      },
                      {
                        key: "link",
                        title: "Sharable link",
                        description: "Anyone with the link can view.",
                      },
                      {
                        key: "public",
                        title: "Public",
                        description: "Visible in the community feed.",
                      },
                    ] as Array<{ key: InsightVisibility; title: string; description: string }>
                  ).map((option) => (
                    <button
                      key={option.key}
                      onClick={() => void onSelectVisibility(option.key)}
                      className={`w-full rounded-md border px-3 py-2 text-left ${
                        visibility === option.key
                          ? "border-foreground bg-black/5 dark:bg-white/10"
                          : "border-black/10 dark:border-white/15"
                      }`}
                    >
                      <div className="text-sm font-medium">{option.title}</div>
                      <div className="text-xs text-foreground/70">{option.description}</div>
                    </button>
                  ))}
                </div>
              ) : null}
              {visibility === "link" ? (
                <div className="rounded-md border border-black/10 dark:border-white/15 p-2 text-xs space-y-2">
                  <div className="text-foreground/70">Sharable link</div>
                  <div className="break-all text-foreground/90">
                    {origin ? `${origin}/insights/shared/${activeDraft.id}` : `/insights/shared/${activeDraft.id}`}
                  </div>
                  <button
                    onClick={async () => {
                      const shareUrl = origin
                        ? `${origin}/insights/shared/${activeDraft.id}`
                        : `/insights/shared/${activeDraft.id}`;
                      await navigator.clipboard.writeText(shareUrl);
                      setShareMessage("Link copied");
                      window.setTimeout(() => setShareMessage(""), 1200);
                    }}
                    className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-xs"
                  >
                    Copy link
                  </button>
                </div>
              ) : null}
              {shareMessage ? <p className="text-xs text-foreground/70 text-center">{shareMessage}</p> : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function InsightBuilderShell() {
  const { canUseInsights, isMobileOpen, toggleMobileBuilder, closeBuilder, activeDraftId } = useInsightBuilder();
  const [mobileToggleBottom, setMobileToggleBottom] = useState(16);

  useEffect(() => {
    const baseBottom = 16;
    let rafId = 0;

    const updatePosition = () => {
      const actionBar = document.querySelector<HTMLElement>('[data-mobile-verse-action-bar="true"]');
      if (!actionBar) {
        setMobileToggleBottom(baseBottom);
        return;
      }
      const rect = actionBar.getBoundingClientRect();
      if (rect.height <= 0) {
        setMobileToggleBottom(baseBottom);
        return;
      }
      // Keep the FAB above the action bar, and above the expanded "More" menu when present.
      const actionBarClearance = Math.round(window.innerHeight - rect.top + 12);
      const menuPanel = document.querySelector<HTMLElement>('[data-mobile-verse-action-menu-panel="true"]');
      const menuRect = menuPanel?.getBoundingClientRect();
      const menuClearance = menuRect && menuRect.height > 0
        ? Math.round(window.innerHeight - menuRect.top + 12)
        : 0;
      const nextBottom = Math.max(baseBottom, actionBarClearance, menuClearance);
      setMobileToggleBottom(nextBottom);
    };

    const scheduleUpdate = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(updatePosition);
    };

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "data-mobile-verse-action-bar",
        "data-mobile-verse-action-menu-open",
        "data-mobile-verse-action-menu-panel",
      ],
    });

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("mobile-verse-action-menu-toggle", scheduleUpdate as EventListener);
    scheduleUpdate();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("mobile-verse-action-menu-toggle", scheduleUpdate as EventListener);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  if (!canUseInsights) return null;

  return (
    <>
      <button
        onClick={toggleMobileBuilder}
        className="lg:hidden fixed z-50 right-4 rounded-full bg-foreground text-background px-4 py-3 text-sm font-medium shadow-lg transition-[bottom] duration-150"
        style={{ bottom: `${mobileToggleBottom}px` }}
      >
        {isMobileOpen ? "Close Insight" : "Open Insight"}
      </button>

      {isMobileOpen ? (
        <div className="lg:hidden fixed inset-0 z-50 bg-background">
          <div className="h-full overflow-hidden">
            <BuilderContent />
          </div>
          <button
            onClick={closeBuilder}
            className="fixed z-[60] right-4 bottom-20 rounded-full border border-black/10 dark:border-white/15 bg-background/95 px-4 py-2 text-xs font-medium shadow-lg backdrop-blur"
          >
            Close
          </button>
        </div>
      ) : null}

      {activeDraftId ? (
        <aside className="hidden lg:block fixed right-0 top-16 bottom-0 z-40 w-[360px] xl:w-[420px] 2xl:w-[480px] border-l border-black/10 dark:border-white/15 bg-background/95 backdrop-blur">
          <BuilderContent />
        </aside>
      ) : null}
    </>
  );
}
