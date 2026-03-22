"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import Link from "next/link";
import type { InsightDraftBlock, InsightVisibility } from "@/lib/appData";
import { useInsightBuilder } from "./InsightBuilderProvider";
import {
  DictionaryBlockEditor,
  QuoteBlockEditor,
  ScriptureBlockEditor,
  TextBlockEditor,
  normalizeDictionaryEntryText,
} from "./InsightBlockEditors";

function blockLabel(type: InsightDraftBlock["type"]) {
  if (type === "scripture") return "Scripture";
  if (type === "quote") return "Quote";
  if (type === "dictionary") return "Dictionary";
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

function tagsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function getHighlightedTextByIndices(text: string, highlightWordIndices: number[]) {
  const tokens = text.match(/\S+\s*/g) ?? [];
  const selected = new Set(highlightWordIndices);
  return tokens
    .filter((_, idx) => selected.has(idx))
    .join("")
    .trim();
}

function visibilityLabel(visibility: InsightVisibility) {
  if (visibility === "friends") return "Friends";
  if (visibility === "link") return "Link";
  if (visibility === "public") return "Public";
  return "Private";
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
    block.type === "scripture"
      ? block.scripture_ref?.reference ?? "Scripture"
      : block.type === "dictionary"
      ? block.dictionary_meta?.word ?? "Dictionary"
      : blockLabel(block.type);

  return (
    <li
      onDragOver={onDragOver}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      }}
      className={`rounded-[1.15rem] border surface-card p-3 space-y-2 ${dragId === block.id ? "opacity-60" : ""}`}
    >
      <div className="relative flex items-center justify-between gap-2">
        <span className="min-w-0 pr-10 text-xs font-medium text-foreground/70 truncate">{title}</span>
        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="absolute left-1/2 flex -translate-x-1/2 cursor-grab items-center justify-center px-1 active:cursor-grabbing"
          title="Drag to reorder"
          aria-label="Drag block"
        >
          <div className="h-1.5 w-8 rounded-full bg-foreground/20" />
        </div>
        <button
          onClick={onRemove}
          className="rounded-full border surface-button px-2 py-0.5 text-sm leading-none text-foreground/70 hover:text-red-600"
          title="Remove block"
          aria-label="Remove block"
        >
          x
        </button>
      </div>
      <div onBlur={block.type === "scripture" || block.type === "dictionary" ? undefined : saveIfChanged}>
        {block.type === "scripture" ? (
          <ScriptureBlockEditor
            block={{ ...block, text }}
            onTextChange={() => {}}
            onLinkChange={() => {}}
            onHighlightWordsChange={async (highlightWordIndices) => {
              setSaving(true);
              try {
                const selectedWords = getHighlightedTextByIndices(text ?? "", highlightWordIndices);
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
            onHighlightWordsChange={async (highlightWordIndices) => {
              setSaving(true);
              try {
                const selectedWords = getHighlightedTextByIndices(text ?? "", highlightWordIndices);
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
        {block.type === "dictionary" ? (
          <DictionaryBlockEditor
            block={{ ...block, text }}
            onHighlightWordsChange={async (highlightWordIndices) => {
              setSaving(true);
              try {
                const normalizedText = normalizeDictionaryEntryText(text ?? "");
                const selectedWords = getHighlightedTextByIndices(normalizedText, highlightWordIndices);
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
      </div>
      {saving ? <div className="text-[11px] text-foreground/60">Saving...</div> : null}
    </li>
  );
}

export default function InsightEditorPanel({
  variant = "embedded",
}: {
  variant?: "embedded" | "floating";
}) {
  const {
    activeDraftId,
    activeDraft,
    isLoading,
    createDraft,
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const didDropRef = useRef(false);
  const orderedBlocks = useMemo(
    () => (activeDraft?.blocks ? [...activeDraft.blocks].sort((a, b) => a.order - b.order) : []),
    [activeDraft?.blocks]
  );

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
    if (!activeDraftId || !activeDraft) return;
    const nextTags = parseTags(tagsInput);
    const currentTags = activeDraft.tags ?? [];
    if (tagsEqual(nextTags, currentTags)) return;

    const timeoutId = window.setTimeout(() => {
      void saveDraftSettings({
        draftId: activeDraftId,
        tags: nextTags,
      });
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [tagsInput, activeDraftId, activeDraft, saveDraftSettings]);

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
    const sure = window.confirm("Delete this note?");
    if (!sure) return;
    setBusy(true);
    try {
      await deleteDraft(activeDraftId);
    } finally {
      setBusy(false);
    }
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

  const shellClassName =
    variant === "embedded"
      ? "rounded-[1.8rem] border surface-card-strong p-4 shadow-[0_24px_70px_rgba(0,0,0,0.12)] sm:p-5"
      : "h-full flex flex-col";

  return (
    <section
      className={shellClassName}
      style={
        variant === "embedded"
          ? {
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--mobile-nav-shell) 58%, var(--surface-card-strong)), var(--surface-card-strong))",
            }
          : undefined
      }
    >
      <div className={variant === "embedded" ? "space-y-4" : "flex h-full flex-col"}>
        <div className={variant === "embedded" ? "space-y-4" : "flex-1 overflow-y-auto space-y-4 p-3"}>
          {isLoading ? <p className="text-sm text-foreground/60">Loading note...</p> : null}

          {!isLoading && !activeDraft ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-foreground/72">Select a saved note from the library, or create a blank note here to start writing.</p>
              <button
                onClick={() => void onCreateDraft()}
                disabled={busy}
                className="rounded-full px-4 py-2 text-sm font-medium text-[color:var(--mobile-nav-active-text)]"
                style={{
                  background: "var(--mobile-nav-active)",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
                }}
              >
                {busy ? "Creating..." : "New note"}
              </button>
            </div>
          ) : null}

          {activeDraft ? (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/65">
                  <span className="rounded-full border surface-button px-2.5 py-1">{visibilityLabel(activeDraft.visibility)}</span>
                  <span>Updated {new Date(activeDraft.updated_at).toLocaleDateString()}</span>
                  <Link href={`/insights/shared/${activeDraft.id}`} className="underline underline-offset-2">
                    View share page
                  </Link>
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => {
                    void onRenameDraft();
                  }}
                  className="w-full rounded-[1rem] border surface-card-soft bg-transparent px-4 py-3 text-base font-medium outline-none"
                  placeholder="Note title"
                />
              </div>

              <div className="rounded-[1.35rem] border surface-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Blocks</h3>
                    <p className="text-xs text-foreground/65">Drag blocks to reorder your thought flow.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => addTextBlock("")}
                      className="rounded-full border surface-button px-3 py-1.5 text-xs"
                    >
                      + Text
                    </button>
                    <button
                      onClick={() => addQuoteBlock("", "")}
                      className="rounded-full border surface-button px-3 py-1.5 text-xs"
                    >
                      + Quote
                    </button>
                    <button
                      onClick={onDeleteDraft}
                      className="rounded-full border border-red-300/60 px-3 py-1.5 text-xs text-red-700 dark:border-red-400/30 dark:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
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
                          className="h-12 rounded-[1rem] border border-dashed border-sky-500/60 bg-sky-500/10"
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
                      className="h-12 rounded-[1rem] border border-dashed border-sky-500/60 bg-sky-500/10"
                    />
                  ) : null}
                </ul>
              </div>

              <div className="rounded-[1.35rem] border surface-card p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Sharing and tags</h3>
                  <p className="text-xs text-foreground/65">Keep metadata close to the draft instead of in a separate screen.</p>
                </div>
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
                  className="w-full rounded-[1rem] border surface-card-soft bg-transparent px-4 py-3 text-sm outline-none"
                  placeholder="Tags (comma separated)"
                />
                <button
                  onClick={() => setIsShareMenuOpen((prev) => !prev)}
                  disabled={busy}
                  className="w-full rounded-[1rem] px-4 py-3 text-sm font-medium text-[color:var(--mobile-nav-active-text)] disabled:opacity-60"
                  style={{ background: "var(--mobile-nav-active)" }}
                >
                  Share settings
                </button>
                {isShareMenuOpen ? (
                  <div className="space-y-2 rounded-[1rem] border surface-card-soft p-2">
                    <div className="text-xs text-foreground/70">Who can view this note?</div>
                    {(
                      [
                        {
                          key: "private",
                          title: "Private",
                          description: "Only you can view this note.",
                        },
                        {
                          key: "friends",
                          title: "Visible to friends",
                          description: "Only friends can open this note.",
                        },
                        {
                          key: "link",
                          title: "Sharable link",
                          description: "Anyone with the link can view.",
                        },
                        {
                          key: "public",
                          title: "Public",
                          description: "Visible in the public notes stream.",
                        },
                      ] as Array<{ key: InsightVisibility; title: string; description: string }>
                    ).map((option) => (
                      <button
                        key={option.key}
                        onClick={() => void onSelectVisibility(option.key)}
                        className={`w-full rounded-[0.95rem] border px-3 py-2 text-left ${
                          visibility === option.key ? "surface-button" : "surface-card-soft"
                        }`}
                      >
                        <div className="text-sm font-medium">{option.title}</div>
                        <div className="text-xs text-foreground/70">{option.description}</div>
                      </button>
                    ))}
                  </div>
                ) : null}
                {visibility === "link" ? (
                  <div className="rounded-[1rem] border surface-card-soft p-3 text-xs space-y-2">
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
                      className="rounded-full border surface-button px-3 py-1.5 text-xs"
                    >
                      Copy link
                    </button>
                  </div>
                ) : null}
                {shareMessage ? <p className="text-center text-xs text-foreground/70">{shareMessage}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
