"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import type { InsightDraftBlock, InsightVisibility } from "@/lib/appData";
import { useAuth } from "@/lib/auth";
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

function tagsEqual(a: string[], b: string[]): boolean {
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

const OPEN_DRAFTS_STORAGE_PREFIX = "vt_reader_open_drafts_v1";
const NOTE_FOLDER_MAP_KEY = "vt_note_folder_map_v1";
const FOLDER_PARENT_MAP_KEY = "vt_folder_parent_map_v1";

type FolderParentMap = Record<string, string>;

function readStoredDraftIds(storageKey: string | null): string[] {
  if (!storageKey || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  } catch {
    return [];
  }
}

function readStoredNoteFolderMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NOTE_FOLDER_MAP_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [draftId, folder] of Object.entries(parsed as Record<string, unknown>)) {
      const id = String(draftId).trim();
      const value = String(folder ?? "").trim();
      if (!id) continue;
      out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function readStoredFolderParentMap(): FolderParentMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FOLDER_PARENT_MAP_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: FolderParentMap = {};
    for (const [childRaw, parentRaw] of Object.entries(parsed as Record<string, unknown>)) {
      const child = String(childRaw).trim();
      const parent = String(parentRaw ?? "").trim();
      if (!child || !parent || child === parent) continue;
      out[child] = parent;
    }
    return out;
  } catch {
    return {};
  }
}

function buildFolderPath(folder: string, parentMap: FolderParentMap): string {
  const trimmed = folder.trim();
  if (!trimmed) return "";
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = trimmed;
  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    chain.push(current);
    current = parentMap[current];
  }
  return chain.reverse().join(" / ");
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
      className={`rounded-md border surface-card p-3 space-y-2 ${dragId === block.id ? "opacity-60" : ""}`}
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
          className="rounded-md border surface-button text-foreground/70 hover:text-red-600 text-sm leading-none px-1.5 py-0.5"
          title="Remove block"
          aria-label="Remove block"
        >
          ×
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
      {saving ? <div className="text-[11px] text-foreground/60">Saving…</div> : null}
    </li>
  );
}

function BuilderContent() {
  const { user } = useAuth();
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
  const [noteFolderMap, setNoteFolderMap] = useState<Record<string, string>>({});
  const [folderParentMap, setFolderParentMap] = useState<FolderParentMap>({});
  const tagAutosaveTimeoutRef = useRef<number | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const didDropRef = useRef(false);
  const hasRestoredOpenDraftsRef = useRef(false);
  const openDraftStorageKey = useMemo(
    () => (user?.id ? `${OPEN_DRAFTS_STORAGE_PREFIX}:${user.id}` : null),
    [user?.id]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncFolders = () => {
      setNoteFolderMap(readStoredNoteFolderMap());
      setFolderParentMap(readStoredFolderParentMap());
    };
    syncFolders();
    window.addEventListener("storage", syncFolders);
    window.addEventListener("focus", syncFolders);
    return () => {
      window.removeEventListener("storage", syncFolders);
      window.removeEventListener("focus", syncFolders);
    };
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
    hasRestoredOpenDraftsRef.current = false;
    setOpenDraftIds([]);
  }, [openDraftStorageKey]);

  useEffect(() => {
    if (isLoading) return;
    const draftIds = drafts.filter((d) => d.status === "draft").map((d) => d.id);
    const draftIdSet = new Set(draftIds);

    if (!hasRestoredOpenDraftsRef.current) {
      const restored = readStoredDraftIds(openDraftStorageKey).filter((id) => draftIdSet.has(id));
      if (activeDraftId && draftIdSet.has(activeDraftId) && !restored.includes(activeDraftId)) {
        restored.push(activeDraftId);
      }
      setOpenDraftIds(restored);
      hasRestoredOpenDraftsRef.current = true;
      return;
    }

    setOpenDraftIds((prev) => {
      const kept = prev.filter((id) => draftIdSet.has(id));
      if (activeDraftId && draftIdSet.has(activeDraftId) && !kept.includes(activeDraftId)) {
        return [...kept, activeDraftId];
      }
      return kept;
    });
  }, [isLoading, drafts, activeDraftId, openDraftStorageKey]);

  useEffect(() => {
    if (!openDraftStorageKey) return;
    if (!hasRestoredOpenDraftsRef.current) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(openDraftStorageKey, JSON.stringify(openDraftIds));
    } catch {
      // ignore storage errors
    }
  }, [openDraftIds, openDraftStorageKey]);

  const orderedBlocks = useMemo(
    () => (activeDraft?.blocks ? [...activeDraft.blocks].sort((a, b) => a.order - b.order) : []),
    [activeDraft?.blocks]
  );
  const hasDraftNotes = useMemo(() => drafts.some((d) => d.status === "draft"), [drafts]);
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
  const hiddenDraftTabsByFolder = useMemo(() => {
    const buckets = new Map<string, (typeof hiddenDraftTabs)[number][]>();
    hiddenDraftTabs.forEach((draft) => {
      const folder = noteFolderMap[draft.id] ?? "";
      const folderPath = buildFolderPath(folder, folderParentMap);
      const key = folderPath || "Root";
      const current = buckets.get(key) ?? [];
      current.push(draft);
      buckets.set(key, current);
    });
    for (const [key, draftList] of buckets.entries()) {
      draftList.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
      buckets.set(key, draftList);
    }
    return Array.from(buckets.entries())
      .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: "base" }))
      .map(([folderLabel, draftList]) => ({ folderLabel, draftList }));
  }, [hiddenDraftTabs, noteFolderMap, folderParentMap]);

  useEffect(() => {
    if (isLoading) return;
    if (openDraftTabs.length > 0) return;
    if (hiddenDraftTabs.length === 0) return;
    setIsLoadSavedOpen(true);
  }, [isLoading, openDraftTabs.length, hiddenDraftTabs.length]);

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
      <div className="p-3 pb-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Notes</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLoadSavedOpen((prev) => !prev)}
              className="rounded-md border surface-button px-2 py-1 text-xs"
            >
              Load notes
            </button>
            <button
              onClick={onCreateDraft}
              disabled={busy}
              className="rounded-md border surface-button px-2 py-1 text-xs"
            >
              + Note
            </button>
          </div>
        </div>
        {isLoadSavedOpen ? (
          <div className="rounded-md border surface-card p-2 space-y-1 max-h-40 overflow-y-auto">
            {hiddenDraftTabs.length === 0 ? (
              <p className="text-xs text-foreground/60 px-1 py-1">No notes available to load.</p>
            ) : (
              hiddenDraftTabsByFolder.map((group) => (
                <div key={group.folderLabel} className="space-y-1">
                  <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
                    {group.folderLabel}
                  </p>
                  {group.draftList.map((draft) => (
                    <button
                      key={draft.id}
                      onClick={() => void onLoadSaved(draft.id)}
                      className="w-full text-left rounded-md border surface-button px-2 py-1.5 text-xs"
                    >
                      {draft.title}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        ) : null}
        <div className="flex items-end gap-1 overflow-x-auto overflow-y-hidden no-scrollbar border-b border-[var(--surface-border)] pb-0">
          {openDraftTabs.map((draft) => (
            <div
              key={draft.id}
              className={`whitespace-nowrap rounded-t-md border border-b-0 px-2 py-1.5 text-xs flex items-center gap-1 ${
                draft.id === activeDraftId
                  ? "surface-card text-foreground relative top-px"
                  : "surface-card-soft text-foreground/75"
              }`}
            >
              <button onClick={() => switchDraft(draft.id)} className="text-left px-1">
                {draft.title}
              </button>
              <button
                onClick={() => void onCloseTab(draft.id)}
                className="inline-flex h-4 w-4 items-center justify-center rounded border surface-button"
                title="Close tab"
                aria-label={`Close ${draft.title}`}
              >
                ×
              </button>
            </div>
          ))}
          {openDraftTabs.length === 0 ? (
            hasDraftNotes ? (
              <button
                onClick={() => setIsLoadSavedOpen(true)}
                className="text-xs text-foreground/70 underline underline-offset-2 px-1 py-1"
              >
                Load notes to select one.
              </button>
            ) : (
              <span className="text-xs text-foreground/60 px-1 py-1">No saved notes yet.</span>
            )
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 pt-0 pb-0 space-y-3">
        {isLoading ? <p className="text-sm text-foreground/60">Loading note...</p> : null}
        {!isLoading && !activeDraft ? (
          hasDraftNotes ? (
            <div className="rounded-md border surface-card p-3 space-y-2">
              <p className="text-sm text-foreground/70">No note loaded. Load notes and select one.</p>
              <button
                onClick={() => setIsLoadSavedOpen(true)}
                className="rounded-md border surface-button px-2 py-1 text-xs"
              >
                Load notes
              </button>
            </div>
          ) : (
            <p className="text-sm text-foreground/70">
              Start a note by tapping a scripture, or create a blank note here.
            </p>
          )
        ) : null}
        {activeDraft ? (
          <div className="-mt-px rounded-b-lg border border-t-0 surface-card p-3 space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                void onRenameDraft();
              }}
              className="w-full rounded-md border surface-card-soft bg-transparent px-3 py-2 text-sm font-medium"
              placeholder="Note title"
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
                className="rounded-md border surface-button px-2 py-1 text-xs"
              >
                + Text
              </button>
              <button
                onClick={() => addQuoteBlock("", "")}
                className="rounded-md border surface-button px-2 py-1 text-xs"
              >
                + Quote
              </button>
              <button
                onClick={onDeleteDraft}
                className="rounded-md border border-red-200 text-red-700 dark:border-red-400/30 px-2 py-1 text-xs"
              >
                Delete note
              </button>
            </div>
            <div className="rounded-md border-t border-[var(--surface-border)] mt-2 pt-3 space-y-2">
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
                className="w-full rounded-md border surface-card-soft bg-transparent px-3 py-2 text-sm"
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
                <div className="space-y-2 rounded-md border surface-card-soft p-2">
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
                      className={`w-full rounded-md border px-3 py-2 text-left ${
                        visibility === option.key
                          ? "surface-button"
                          : "surface-card-soft"
                      }`}
                    >
                      <div className="text-sm font-medium">{option.title}</div>
                      <div className="text-xs text-foreground/70">{option.description}</div>
                    </button>
                  ))}
                </div>
              ) : null}
              {visibility === "link" ? (
                <div className="rounded-md border surface-card-soft p-2 text-xs space-y-2">
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
                    className="rounded-md border surface-button px-2 py-1 text-xs"
                  >
                    Copy link
                  </button>
                </div>
              ) : null}
              {shareMessage ? <p className="text-xs text-foreground/70 text-center">{shareMessage}</p> : null}
            </div>
          </div>
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
        {isMobileOpen ? "Close Note" : "Open Note"}
      </button>

      {isMobileOpen ? (
        <div className="lg:hidden fixed inset-0 z-50 bg-background">
          <div className="h-full overflow-hidden">
            <BuilderContent />
          </div>
          <button
            onClick={closeBuilder}
            className="fixed z-[60] right-4 bottom-20 rounded-full border surface-button px-4 py-2 text-xs font-medium shadow-lg backdrop-blur"
          >
            Close
          </button>
        </div>
      ) : null}

      {activeDraftId ? (
        <aside className="hidden lg:block fixed right-0 top-16 bottom-0 z-40 w-[360px] xl:w-[420px] 2xl:w-[480px] border-l border-[var(--surface-border)] bg-[var(--surface-card-strong)] backdrop-blur">
          <BuilderContent />
        </aside>
      ) : null}
    </>
  );
}
