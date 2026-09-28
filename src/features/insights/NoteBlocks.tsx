"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import type { InsightDraftBlock, InsightDraftSummary } from "@/lib/appData";
import { useInsightBuilder, type NoteSaveStatus } from "./InsightBuilderProvider";
import {
  DictionaryBlockEditor,
  QuoteBlockEditor,
  ScriptureBlockEditor,
  normalizeDictionaryEntryText,
} from "./InsightBlockEditors";
import { LightbulbBadge } from "./NoteMenus";

// ---------------------------------------------------------------------------
// Block look: tint + badge per type
// ---------------------------------------------------------------------------

const BLOCK_LOOK: Record<
  InsightDraftBlock["type"],
  { label: string; tint: string; badgeTint: string; glyph: string; glyphClass: string }
> = {
  scripture: { label: "Scripture", tint: "var(--surface-card-soft)", badgeTint: "var(--accent-primary)", glyph: "¶", glyphClass: "font-serif text-base" },
  text: { label: "Text", tint: "var(--surface-card)", badgeTint: "var(--surface-card)", glyph: "T", glyphClass: "font-display text-sm font-extrabold" },
  dictionary: { label: "Definition", tint: "var(--accent-sky-soft)", badgeTint: "var(--accent-sky)", glyph: "Aa", glyphClass: "font-display text-[0.7rem] font-extrabold" },
  quote: { label: "Quote", tint: "var(--accent-mint)", badgeTint: "var(--surface-card)", glyph: "“", glyphClass: "font-serif text-xl leading-none pt-1.5" },
};

function blockTitle(block: InsightDraftBlock): string {
  if (block.type === "scripture") return block.scripture_ref?.reference ?? "Scripture";
  if (block.type === "dictionary") return block.dictionary_meta?.word ?? "Definition";
  return BLOCK_LOOK[block.type].label;
}

function scriptureHref(ref: NonNullable<InsightDraftBlock["scripture_ref"]>): string {
  return `/browse/${encodeURIComponent(ref.volume)}/${encodeURIComponent(ref.book)}/${ref.chapter}#v-${ref.verseStart}`;
}

function getHighlightedTextByIndices(text: string, highlightWordIndices: number[]) {
  const tokens = text.match(/\S+\s*/g) ?? [];
  const selected = new Set(highlightWordIndices);
  return tokens
    .filter((_, idx) => selected.has(idx))
    .join("")
    .trim();
}

function GripIcon() {
  return (
    <svg viewBox="0 0 10 16" aria-hidden="true" className="h-3.5 w-2.5 fill-current">
      <circle cx="2.5" cy="2.5" r="1.6" />
      <circle cx="7.5" cy="2.5" r="1.6" />
      <circle cx="2.5" cy="8" r="1.6" />
      <circle cx="7.5" cy="8" r="1.6" />
      <circle cx="2.5" cy="13.5" r="1.6" />
      <circle cx="7.5" cy="13.5" r="1.6" />
    </svg>
  );
}

type BlockPatch = { text?: string; linkUrl?: string; highlightText?: string; highlightWordIndices?: number[] };

function BlockCard({
  block,
  index,
  count,
  isDragging,
  readOnly,
  autoFocusText,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMove,
  onRemove,
  onSave,
}: {
  block: InsightDraftBlock;
  index: number;
  count: number;
  isDragging: boolean;
  readOnly: boolean;
  autoFocusText: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: ReactDragEvent<HTMLLIElement>) => void;
  onDrop: () => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onSave: (patch: BlockPatch) => Promise<void>;
}) {
  const [text, setText] = useState(block.text ?? "");
  const [linkUrl, setLinkUrl] = useState(block.link_url ?? "");
  const [editingQuoteText, setEditingQuoteText] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const look = BLOCK_LOOK[block.type];
  const title = blockTitle(block);

  useEffect(() => {
    setText(block.text ?? "");
    setLinkUrl(block.link_url ?? "");
  }, [block.id, block.text, block.link_url]);

  useEffect(() => {
    if (!autoFocusText) return;
    const node = textareaRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, [autoFocusText]);

  async function saveIfChanged() {
    if (readOnly) return;
    const nextText = text.trim();
    const nextLink = linkUrl.trim();
    if (nextText === (block.text ?? "").trim() && nextLink === (block.link_url ?? "").trim()) return;
    await onSave({ text, linkUrl: block.type === "quote" ? linkUrl : undefined });
  }

  async function saveHighlights(highlightWordIndices: number[], sourceText: string) {
    if (readOnly) return;
    await onSave({
      highlightWordIndices,
      highlightText: getHighlightedTextByIndices(sourceText, highlightWordIndices) || "",
    });
  }

  function onGripKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      onMove(-1);
    } else if (event.key === "ArrowDown" && index < count - 1) {
      event.preventDefault();
      onMove(1);
    }
  }

  const quoteHasText = text.trim().length > 0;
  const showQuoteTextarea = block.type === "quote" && (!quoteHasText || editingQuoteText);

  return (
    <li
      onDragOver={onDragOver}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      }}
      className={`relative rounded-[1rem] border-2 border-[color:var(--surface-border)] p-3 pl-[3.1rem] ${
        isDragging ? "opacity-50" : ""
      }`}
      style={{ background: look.tint }}
    >
      <span
        aria-hidden="true"
        className={`absolute left-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-[0.6rem] border-2 border-[color:var(--surface-border)] ${look.glyphClass}`}
        style={{ background: look.badgeTint, color: block.type === "scripture" ? "#17161a" : "var(--foreground)" }}
      >
        {look.glyph}
      </span>

      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[0.66rem] font-bold uppercase tracking-[0.08em] text-foreground/60">
          {block.type === "scripture" && block.scripture_ref ? (
            <Link href={scriptureHref(block.scripture_ref)} className="hover:underline underline-offset-2">
              {title}
            </Link>
          ) : (
            title
          )}
        </span>
        {!readOnly ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", block.id);
                onDragStart();
              }}
              onDragEnd={onDragEnd}
              onKeyDown={onGripKeyDown}
              aria-label={`Drag to reorder ${title}. Use arrow keys to move it.`}
              title="Drag to reorder"
              className="inline-flex h-7 w-6 cursor-grab items-center justify-center rounded-[0.5rem] text-foreground/60 hover:bg-[color:var(--surface-button-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] active:cursor-grabbing"
            >
              <GripIcon />
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${title}`}
              title="Remove block"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] text-foreground/80 hover:bg-[color:var(--accent-coral)] hover:text-[#17161a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
            >
              <FontAwesomeIcon icon={faXmark} className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      <div className={`mt-1 ${readOnly ? "pointer-events-none" : ""}`} onBlur={block.type === "text" || block.type === "quote" ? () => void saveIfChanged() : undefined}>
        {block.type === "scripture" ? (
          <ScriptureBlockEditor block={{ ...block, text }} onHighlightWordsChange={(indices) => void saveHighlights(indices, text)} />
        ) : null}

        {block.type === "text" ? (
          <textarea
            ref={textareaRef}
            value={text}
            readOnly={readOnly}
            onChange={(event) => setText(event.target.value)}
            aria-label="Note text"
            placeholder="Write your thoughts…"
            className="field-sizing-content min-h-[3.5rem] w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-foreground/45"
          />
        ) : null}

        {block.type === "quote" ? (
          <div className="space-y-2">
            {showQuoteTextarea ? (
              <textarea
                ref={textareaRef}
                value={text}
                readOnly={readOnly}
                onChange={(event) => setText(event.target.value)}
                aria-label="Quote text"
                placeholder="Paste or type the quote…"
                className="field-sizing-content min-h-[3.5rem] w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-foreground/45"
              />
            ) : (
              <QuoteBlockEditor
                block={{ ...block, text, link_url: linkUrl }}
                onHighlightWordsChange={(indices) => void saveHighlights(indices, text)}
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={linkUrl}
                readOnly={readOnly}
                onChange={(event) => setLinkUrl(event.target.value)}
                aria-label="Source link"
                placeholder="Source link (optional)"
                className="min-w-0 flex-1 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] px-3 py-1 text-xs outline-none placeholder:text-foreground/45 focus:bg-[color:var(--surface-card)]"
              />
              {quoteHasText && !readOnly ? (
                <button
                  type="button"
                  onClick={() => setEditingQuoteText((prev) => !prev)}
                  className="surface-button rounded-full border-2 px-2.5 py-1 text-[0.7rem]"
                >
                  {editingQuoteText ? "Done" : "Edit text"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {block.type === "dictionary" ? (
          <DictionaryBlockEditor
            block={{ ...block, text }}
            onHighlightWordsChange={(indices) => void saveHighlights(indices, normalizeDictionaryEntryText(text))}
          />
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The block list with drag-to-reorder. Shared by the reader panel and /notes.
// ---------------------------------------------------------------------------

function DropSlot({ onDrop }: { onDrop: () => void }) {
  return (
    <li
      aria-hidden="true"
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      }}
      className="h-10 rounded-[1rem] border-2 border-dashed border-[color:var(--accent-secondary)] bg-[color:var(--accent-sky-soft)]"
    />
  );
}

export function NoteBlockList({
  blocks,
  readOnly = false,
  focusToken = 0,
  emptyHint,
}: {
  blocks: InsightDraftBlock[];
  readOnly?: boolean;
  /** Bump after adding a text block to focus the newest empty one. */
  focusToken?: number;
  emptyHint?: string;
}) {
  const { updateBlock, removeBlock, reorderBlocks } = useInsightBuilder();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const didDropRef = useRef(false);
  const handledFocusTokenRef = useRef(0);
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);

  const ordered = useMemo(() => [...blocks].sort((a, b) => a.order - b.order), [blocks]);

  useEffect(() => {
    if (focusToken <= handledFocusTokenRef.current) return;
    const last = ordered[ordered.length - 1];
    if (!last || (last.type !== "text" && last.type !== "quote") || (last.text ?? "").trim()) return;
    handledFocusTokenRef.current = focusToken;
    setFocusBlockId(last.id);
  }, [focusToken, ordered]);

  function setDragState(nextDragId: string | null, nextDropIndex: number | null) {
    dragIdRef.current = nextDragId;
    dropIndexRef.current = nextDropIndex;
    setDragId(nextDragId);
    setDropIndex(nextDropIndex);
  }

  function commitDrop() {
    const draggingId = dragIdRef.current;
    const insertionIndex = dropIndexRef.current;
    didDropRef.current = true;
    if (!draggingId || insertionIndex === null) {
      setDragState(null, null);
      return;
    }
    const from = ordered.findIndex((b) => b.id === draggingId);
    if (from >= 0) {
      const insertion = Math.max(0, Math.min(insertionIndex, ordered.length));
      const to = from < insertion ? insertion - 1 : insertion;
      if (to !== from && to >= 0 && to < ordered.length) void reorderBlocks(from, to);
    }
    setDragState(null, null);
  }

  if (ordered.length === 0) {
    return (
      <p className="rounded-[1rem] border-2 border-dashed border-[color:var(--surface-border)] px-4 py-5 text-center text-sm text-foreground/65">
        {emptyHint ?? "This note is empty. Select a verse and tap Add to note, or write something below."}
      </p>
    );
  }

  return (
    <ul
      className="space-y-2"
      aria-label="Note blocks"
      onDragOver={(event) => {
        event.preventDefault();
        if (!dragIdRef.current || event.target !== event.currentTarget) return;
        setDragState(dragIdRef.current, ordered.length);
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (event.target !== event.currentTarget) return;
        commitDrop();
      }}
    >
      {ordered.map((block, index) => (
        <Fragment key={block.id}>
          {dragId && dropIndex === index ? <DropSlot onDrop={commitDrop} /> : null}
          <BlockCard
            block={block}
            index={index}
            count={ordered.length}
            isDragging={dragId === block.id}
            readOnly={readOnly}
            autoFocusText={focusBlockId === block.id}
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
            onDrop={commitDrop}
            onMove={(delta) => void reorderBlocks(index, index + delta)}
            onRemove={() => void removeBlock(block.id)}
            onSave={(patch) => updateBlock(block.id, patch)}
          />
        </Fragment>
      ))}
      {dragId && dropIndex === ordered.length ? <DropSlot onDrop={commitDrop} /> : null}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Tag chips with inline "+ tag"
// ---------------------------------------------------------------------------

const TAG_TINTS = [
  "var(--accent-note)",
  "var(--accent-sky-soft)",
  "var(--accent-mint)",
  "var(--accent-sky)",
  "var(--surface-card-soft)",
  "var(--accent-primary)",
];

export function tagTint(tag: string): string {
  let hash = 2166136261;
  for (let i = 0; i < tag.length; i += 1) {
    hash ^= tag.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return TAG_TINTS[(hash >>> 0) % TAG_TINTS.length];
}

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, "").replace(/,+$/, "").toLowerCase();
}

export function TagChip({
  tag,
  onRemove,
  onClick,
  active = false,
  size = "md",
}: {
  tag: string;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
  size?: "sm" | "md";
}) {
  const sizing = size === "sm" ? "px-2 py-0 text-[0.66rem]" : "px-2.5 py-0.5 text-[0.72rem]";
  const base = `inline-flex items-center gap-1 rounded-full border-2 border-[color:var(--surface-border)] font-bold leading-5 text-foreground ${sizing}`;
  const style = { background: active ? "var(--surface-button-active)" : tagTint(tag), color: active ? "var(--surface-button-active-text)" : undefined };
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={`${base} hover:opacity-85`} style={style}>
        #{tag}
      </button>
    );
  }
  return (
    <span className={`group ${base}`} style={style}>
      #{tag}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove tag ${tag}`}
          className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-foreground/60 hover:bg-[color:var(--surface-border)] hover:text-[color:var(--surface-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
        >
          <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

export function NoteTagChips({
  note,
  readOnly = false,
}: {
  note: Pick<InsightDraftSummary, "id" | "tags" | "status">;
  readOnly?: boolean;
}) {
  const { saveDraftSettings } = useInsightBuilder();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tags = note.tags ?? [];
  const editable = !readOnly && note.status === "draft";

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  async function commit(raw: string) {
    const next = raw
      .split(",")
      .map(normalizeTag)
      .filter((tag) => tag && !tags.includes(tag));
    setDraft("");
    if (next.length === 0) return;
    await saveDraftSettings({ draftId: note.id, tags: [...tags, ...next].slice(0, 20) });
  }

  async function remove(tag: string) {
    await saveDraftSettings({ draftId: note.id, tags: tags.filter((item) => item !== tag) });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Tags">
      {tags.map((tag) => (
        <TagChip key={tag} tag={tag} onRemove={editable ? () => void remove(tag) : undefined} />
      ))}
      {editable ? (
        adding ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                void commit(draft);
              } else if (event.key === "Escape") {
                event.preventDefault();
                setDraft("");
                setAdding(false);
              }
            }}
            onBlur={() => {
              void commit(draft);
              setAdding(false);
            }}
            aria-label="New tag"
            placeholder="tag name"
            className="h-6 w-28 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] px-2.5 text-[0.72rem] font-semibold outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border-2 border-dashed border-[color:var(--surface-border)] px-2.5 py-0.5 text-[0.72rem] font-bold leading-5 text-foreground/70 hover:bg-[color:var(--surface-button-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
          >
            <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5" aria-hidden="true" />
            tag
          </button>
        )
      ) : tags.length === 0 ? (
        <span className="text-xs text-foreground/50">No tags</span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Saved just now / Saving..." status
// ---------------------------------------------------------------------------

export function SaveStatusLabel({ className = "" }: { className?: string }) {
  const { saveStatus, lastSavedAt } = useInsightBuilder();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!lastSavedAt) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 20_000);
    return () => window.clearInterval(id);
  }, [lastSavedAt]);

  const label = describeSaveStatus(saveStatus, lastSavedAt);
  return (
    <span className={`shrink-0 text-xs font-semibold text-foreground/55 ${className}`} aria-live="polite">
      {label}
    </span>
  );
}

export function describeSaveStatus(status: NoteSaveStatus, lastSavedAt: number | null): string {
  if (status === "saving") return "Saving…";
  if (status === "saved" && lastSavedAt && Date.now() - lastSavedAt < 60_000) return "Saved just now";
  return "Saved";
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function NoNotesYet({ size = "panel", onCreate, busy = false }: { size?: "panel" | "page"; onCreate: () => void; busy?: boolean }) {
  const large = size === "page";
  return (
    <div
      className={`sticky-note mx-auto flex w-full flex-col items-center gap-3 text-center ${
        large ? "max-w-md rotate-[-1deg] px-6 py-8" : "px-4 py-6"
      }`}
    >
      <LightbulbBadge size={large ? "lg" : "md"} />
      <p className={`font-display font-extrabold tracking-[-0.02em] text-foreground ${large ? "text-xl" : "text-base"}`}>No notes yet.</p>
      <p className={`text-foreground/75 ${large ? "text-sm" : "text-xs"}`}>
        Select a verse and tap <strong>Add to note</strong>, or start one here.
      </p>
      <button
        type="button"
        onClick={onCreate}
        disabled={busy}
        className="inline-flex h-10 items-center gap-1.5 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] px-4 text-sm font-bold text-foreground shadow-[var(--surface-shadow-soft)] hover:bg-[color:var(--surface-button-hover)] disabled:opacity-60"
      >
        <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
        New note
      </button>
    </div>
  );
}
