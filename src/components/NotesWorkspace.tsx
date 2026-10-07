"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBook,
  faDownload,
  faEllipsis,
  faFolder,
  faFolderPlus,
  faMagnifyingGlass,
  faPlus,
  faSpellCheck,
} from "@fortawesome/free-solid-svg-icons";
import { SignInButton } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import AccountControl from "@/components/AccountControl";
import { useAuth } from "@/lib/auth";
import { getInsightDraft, type InsightDraftSummary } from "@/lib/appData";
import {
  buildFolderPath,
  clearLegacyLocalFolderData,
  optimisticDeleteFolder,
  optimisticMoveFolder,
  optimisticRenameFolder,
  readLegacyLocalFolderData,
  type FolderParentMap,
} from "@/lib/noteFolders";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { useNoteFolders } from "@/features/insights/useNoteFolders";
import {
  ICON_BUTTON_CLASS,
  LightbulbBadge,
  MenuItem,
  NoteOptionsMenu,
  Popover,
  ShareButton,
  StatusPill,
  useIsPhoneLayout,
  visibilityLabel,
} from "@/features/insights/NoteMenus";
import { NoNotesYet, NoteBlockList, NoteTagChips, SaveStatusLabel, TagChip } from "@/features/insights/NoteBlocks";
import AiInsightAssistant from "@/features/insights/AiInsightAssistant";

type SortKey = "recent" | "alpha" | "scripture";
type FolderSelection = "all" | "unfiled" | { folder: string };

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "recent", label: "Recent" },
  { key: "alpha", label: "A–Z" },
  { key: "scripture", label: "By scripture" },
];

function isDescendant(node: string, maybeAncestor: string, parentMap: FolderParentMap): boolean {
  let current = node;
  const seen = new Set<string>();
  while (parentMap[current]) {
    const parent = parentMap[current];
    if (parent === maybeAncestor) return true;
    if (seen.has(parent)) return false;
    seen.add(parent);
    current = parent;
  }
  return false;
}

function toMarkdownFromDraft(draft: {
  title: string;
  updated_at: string;
  visibility: InsightDraftSummary["visibility"];
  tags: string[];
  blocks: Array<{
    order: number;
    type: "scripture" | "text" | "quote" | "dictionary";
    scripture_ref: { reference: string } | null;
    link_url: string | null;
    text: string | null;
  }>;
}) {
  const lines: string[] = [];
  lines.push(`# ${draft.title || "Untitled note"}`);
  lines.push("");
  lines.push(`Updated: ${new Date(draft.updated_at).toLocaleString()}`);
  lines.push(`Visibility: ${visibilityLabel(draft.visibility)}`);
  lines.push(`Tags: ${(draft.tags ?? []).map((tag) => `#${tag}`).join(", ") || "(none)"}`);
  lines.push("");
  lines.push("## Blocks");
  lines.push("");

  draft.blocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((block, idx) => {
      lines.push(`### ${idx + 1}. ${block.type === "scripture" ? block.scripture_ref?.reference ?? "Scripture" : block.type}`);
      if (block.link_url) lines.push(`Source: ${block.link_url}`);
      if (block.text) lines.push(block.text);
      lines.push("");
    });

  return lines.join("\n");
}

const NEW_NOTE_BUTTON_CLASS =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--accent-primary)] px-4 font-display text-[0.95rem] font-extrabold tracking-[-0.01em] text-[#17161a] shadow-[var(--surface-shadow-soft)] hover:shadow-[var(--surface-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-60";

const DASHED_BUTTON_CLASS =
  "inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-dashed border-[color:var(--surface-border)] px-3.5 text-sm font-bold text-foreground/80 hover:bg-[color:var(--surface-button-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50";

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="page-eyebrow px-1">{children}</div>;
}

// ---------------------------------------------------------------------------

export default function NotesWorkspace() {
  const { user, getToken, loading } = useAuth();
  const isPhone = useIsPhoneLayout();
  const {
    drafts,
    activeDraftId,
    activeDraft,
    isLoading,
    switchDraft,
    createDraft,
    renameDraft,
    deleteDraft,
    addTextBlock,
    addQuoteBlock,
  } = useInsightBuilder();
  const {
    workspace,
    folderNames,
    folderParentMap,
    noteFolderMap,
    folderIdByName,
    folderTree,
    assignFolder,
  } = useNoteFolders();
  const createFolderMutation = useMutation(api.noteFolders.createFolder);
  const renameFolderMutation = useMutation(api.noteFolders.renameFolder).withOptimisticUpdate(optimisticRenameFolder);
  const moveFolderMutation = useMutation(api.noteFolders.moveFolder).withOptimisticUpdate(optimisticMoveFolder);
  const deleteFolderMutation = useMutation(api.noteFolders.deleteFolder).withOptimisticUpdate(optimisticDeleteFolder);
  const importLocalFoldersMutation = useMutation(api.noteFolders.importLocalFolders);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [folderSelection, setFolderSelection] = useState<FolderSelection>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mobileView, setMobileView] = useState<"list" | "editor">(activeDraftId ? "editor" : "list");
  const [folderModal, setFolderModal] = useState<{ mode: "create"; parent: string } | { mode: "rename"; folder: string } | null>(null);
  const [folderModalName, setFolderModalName] = useState("");
  const [folderModalParent, setFolderModalParent] = useState("");
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [draggedFolderName, setDraggedFolderName] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | "__root__" | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [shareSignal, setShareSignal] = useState(0);
  const [focusToken, setFocusToken] = useState(0);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const legacyImportAttemptedRef = useRef(false);

  const rows = drafts;
  const activeSummary = useMemo(() => rows.find((row) => row.id === activeDraftId) ?? null, [rows, activeDraftId]);
  const readOnly = activeDraft ? activeDraft.status !== "draft" : false;

  useEffect(() => {
    setTitleDraft(activeDraft?.title ?? "");
  }, [activeDraft?.id, activeDraft?.title]);

  // One-time import of the folder maps that used to live in localStorage.
  useEffect(() => {
    if (!user || !workspace || legacyImportAttemptedRef.current) return;
    const legacy = readLegacyLocalFolderData();
    if (!legacy.hasData) return;
    legacyImportAttemptedRef.current = true;
    if (workspace.folders.length > 0 || workspace.assignments.length > 0) {
      clearLegacyLocalFolderData();
      console.info("[notes] Folders already live in the cloud; dropped stale local folder data.");
      return;
    }
    importLocalFoldersMutation({
      folderNames: legacy.folderNames,
      parentMap: legacy.parentMap,
      noteFolderMap: legacy.noteFolderMap,
    })
      .then((result) => {
        clearLegacyLocalFolderData();
        console.info(
          `[notes] Imported local folders to the cloud: ${result.createdFolders} folders, ${result.linkedParents} nested, ${result.assignedNotes} notes filed.`
        );
      })
      .catch((error: unknown) => {
        legacyImportAttemptedRef.current = false;
        console.warn("[notes] Could not import local folders yet; will retry.", error);
      });
  }, [user, workspace, importLocalFoldersMutation]);

  // ---- derived data -------------------------------------------------------

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const row of rows) for (const tag of row.tags ?? []) tags.add(tag);
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const normalizedParentMap = useMemo(() => {
    const valid = new Set(folderNames);
    const out: FolderParentMap = {};
    for (const folder of folderNames) {
      const parent = folderParentMap[folder];
      if (!parent || !valid.has(parent) || parent === folder) continue;
      if (isDescendant(parent, folder, folderParentMap)) continue;
      out[folder] = parent;
    }
    return out;
  }, [folderNames, folderParentMap]);

  /** Folder -> itself plus every descendant, so selecting a folder shows the whole subtree. */
  const subtreeByFolder = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const folder of folderNames) {
      const set = new Set<string>([folder]);
      for (const other of folderNames) if (isDescendant(other, folder, normalizedParentMap)) set.add(other);
      map.set(folder, set);
    }
    return map;
  }, [folderNames, normalizedParentMap]);

  const countByFolder = useMemo(() => {
    const direct = new Map<string, number>();
    let unfiled = 0;
    for (const row of rows) {
      const folder = noteFolderMap[row.id];
      if (folder && folderIdByName.has(folder)) direct.set(folder, (direct.get(folder) ?? 0) + 1);
      else unfiled += 1;
    }
    const total = new Map<string, number>();
    for (const [folder, subtree] of subtreeByFolder) {
      let count = 0;
      subtree.forEach((name) => (count += direct.get(name) ?? 0));
      total.set(folder, count);
    }
    return { total, unfiled };
  }, [rows, noteFolderMap, folderIdByName, subtreeByFolder]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const folder = noteFolderMap[row.id] ?? "";
      if (folderSelection === "unfiled" && folder) return false;
      if (typeof folderSelection === "object" && !(subtreeByFolder.get(folderSelection.folder)?.has(folder) ?? false)) return false;
      if (selectedTags.length > 0 && !selectedTags.every((tag) => (row.tags ?? []).includes(tag))) return false;
      if (!q) return true;
      const haystack = [
        row.title,
        ...(row.tags ?? []),
        buildFolderPath(folder, folderParentMap),
        row.excerpt ?? "",
        ...(row.scripture_refs ?? []),
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(q);
    });
    const byTitle = (a: InsightDraftSummary, b: InsightDraftSummary) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    if (sort === "alpha") return filtered.sort(byTitle);
    if (sort === "scripture") {
      return filtered.sort((a, b) => {
        const refA = a.scripture_refs?.[0];
        const refB = b.scripture_refs?.[0];
        if (refA && refB) return refA.localeCompare(refB, undefined, { numeric: true, sensitivity: "base" }) || byTitle(a, b);
        if (refA) return -1;
        if (refB) return 1;
        return byTitle(a, b);
      });
    }
    return filtered.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [rows, search, noteFolderMap, folderParentMap, folderSelection, subtreeByFolder, selectedTags, sort]);

  // A deleted or renamed folder must not leave a stale selection behind.
  useEffect(() => {
    if (typeof folderSelection === "object" && !folderIdByName.has(folderSelection.folder)) setFolderSelection("all");
  }, [folderSelection, folderIdByName]);

  // ---- actions ------------------------------------------------------------

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }

  const openNote = useCallback(
    async (noteId: string) => {
      if (noteId !== activeDraftId) await switchDraft(noteId);
      setMobileView("editor");
    },
    [activeDraftId, switchDraft]
  );

  async function onCreateNewNote() {
    await run(async () => {
      const createdId = await createDraft("New note");
      if (!createdId) return;
      if (typeof folderSelection === "object") await assignFolder(createdId, folderSelection.folder);
      setMobileView("editor");
      window.setTimeout(() => titleInputRef.current?.select(), 50);
    });
  }

  async function commitTitle() {
    if (!activeDraft || readOnly) return;
    const next = titleDraft.trim();
    if (!next || next === activeDraft.title.trim()) {
      setTitleDraft(activeDraft.title);
      return;
    }
    await renameDraft(activeDraft.id, next);
  }

  function onDeleteActive() {
    if (!activeDraft) return;
    if (!window.confirm(`Delete "${activeDraft.title}"? This cannot be undone.`)) return;
    void run(async () => {
      await deleteDraft(activeDraft.id);
      setMobileView("list");
    });
  }

  async function onWrite() {
    await run(() => addTextBlock(""));
    setFocusToken((n) => n + 1);
  }

  async function onQuote() {
    await run(() => addQuoteBlock("", ""));
    setFocusToken((n) => n + 1);
  }

  async function createFolder(name: string, parent: string | null) {
    const trimmed = name.trim();
    if (!trimmed || folderNames.includes(trimmed)) return false;
    const parentId = parent ? folderIdByName.get(parent) : undefined;
    if (parent && !parentId) return false;
    await createFolderMutation({ name: trimmed, parentFolderId: parentId });
    return true;
  }

  async function renameFolder(from: string, to: string) {
    const toName = to.trim();
    if (!toName) return false;
    if (from === toName) return true;
    if (folderNames.includes(toName)) return false;
    const folderId = folderIdByName.get(from);
    if (!folderId) return false;
    await renameFolderMutation({ folderId, name: toName });
    setFolderSelection((prev) => (typeof prev === "object" && prev.folder === from ? { folder: toName } : prev));
    return true;
  }

  async function moveFolder(folder: string, targetParent: string | null) {
    if (!folder || targetParent === folder) return;
    if (targetParent && isDescendant(targetParent, folder, normalizedParentMap)) return;
    const folderId = folderIdByName.get(folder);
    if (!folderId) return;
    const parentId = targetParent ? folderIdByName.get(targetParent) : undefined;
    if (targetParent && !parentId) return;
    await moveFolderMutation({ folderId, parentFolderId: parentId });
  }

  async function deleteFolder(folder: string) {
    const folderId = folderIdByName.get(folder);
    if (!folderId) return;
    await deleteFolderMutation({ folderId });
  }

  function openFolderModal(next: { mode: "create"; parent: string } | { mode: "rename"; folder: string }) {
    setFolderModal(next);
    setFolderModalName(next.mode === "rename" ? next.folder : "");
    setFolderModalParent(next.mode === "create" ? next.parent : "");
  }

  async function submitFolderModal() {
    if (!folderModal) return;
    const ok =
      folderModal.mode === "create"
        ? await createFolder(folderModalName, folderModalParent || null)
        : await renameFolder(folderModal.folder, folderModalName);
    if (ok) setFolderModal(null);
  }

  async function exportAllNotes() {
    if (!user || rows.length === 0) return;
    setIsBulkExporting(true);
    try {
      const token = await getToken({ template: "convex" });
      if (!token) return;
      const sections: string[] = [];
      sections.push("# Verse Together - All Notes Export");
      sections.push("");
      sections.push(`Exported: ${new Date().toLocaleString()}`);
      sections.push(`Total notes: ${rows.length}`);
      sections.push("");

      for (const row of rows) {
        const folder = buildFolderPath(noteFolderMap[row.id] ?? "", folderParentMap) || "Unfiled";
        const draft = await getInsightDraft(token, row.id);
        sections.push("---");
        sections.push("");
        sections.push(`Folder: ${folder}`);
        sections.push(toMarkdownFromDraft(draft));
        sections.push("");
      }

      const blob = new Blob([sections.join("\n")], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `verse-together-notes-${stamp}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsBulkExporting(false);
    }
  }

  // ---- drag and drop onto folders ----------------------------------------

  function dropProps(target: string | "__root__") {
    return {
      onDragOver: (event: React.DragEvent) => {
        if (!draggedNoteId && !draggedFolderName) return;
        if (draggedFolderName && target !== "__root__" && (draggedFolderName === target || isDescendant(target, draggedFolderName, normalizedParentMap))) return;
        event.preventDefault();
        event.stopPropagation();
        setDragOverTarget(target);
      },
      onDragLeave: () => {
        if (dragOverTarget === target) setDragOverTarget(null);
      },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const noteId = draggedNoteId || event.dataTransfer.getData("text/note-id");
        const folderName = draggedFolderName || event.dataTransfer.getData("text/folder-name");
        const folder = target === "__root__" ? null : target;
        if (noteId) void assignFolder(noteId, folder);
        else if (folderName) void moveFolder(folderName, folder);
        setDraggedNoteId(null);
        setDraggedFolderName(null);
        setDragOverTarget(null);
      },
    };
  }

  // ---- states before the workspace ---------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-[color:var(--foreground-muted)]">Loading notes…</div>
        <AccountControl variant="page" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AccountControl variant="page" />
        <div className="panel-card mx-auto flex max-w-xl flex-col items-center gap-4 rounded-[1.5rem] px-6 py-8 text-center">
          <LightbulbBadge size="lg" />
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">Sign in to use Notes</h1>
            <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">
              Keep verses, quotes and definitions together in notes, file them in folders, tag them, and share the ones you want to.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href="/browse" className="surface-button inline-flex h-10 items-center rounded-full border-2 px-4 text-sm">
              Browse scriptures
            </Link>
            <SignInButton mode="modal">
              <button className="inline-flex h-10 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)]">
                Sign in
              </button>
            </SignInButton>
          </div>
        </div>
      </>
    );
  }

  // ---- pieces -------------------------------------------------------------

  const folderRowClass = (active: boolean, over: boolean) =>
    `flex h-9 w-full items-center gap-2 rounded-full border-2 px-3 text-left text-sm font-semibold transition-colors ${
      active
        ? "border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] text-[color:var(--surface-button-active-text)]"
        : over
        ? "border-dashed border-[color:var(--accent-secondary)] bg-[color:var(--accent-sky-soft)]"
        : "border-transparent hover:bg-[color:var(--surface-button-hover)]"
    }`;

  const newNoteButton = (
    <button type="button" onClick={() => void onCreateNewNote()} disabled={busy} className={NEW_NOTE_BUTTON_CLASS}>
      <LightbulbBadge size="sm" className="bg-[color:var(--surface-card)]" />
      New note
    </button>
  );

  const leftColumn = (
    <aside className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto lg:pr-1" aria-label="Folders and tags">
      {newNoteButton}

      <section className="space-y-1">
        <div className="flex items-center justify-between">
          <Eyebrow>Folders</Eyebrow>
        </div>
        <button
          type="button"
          onClick={() => setFolderSelection("all")}
          aria-pressed={folderSelection === "all"}
          className={folderRowClass(folderSelection === "all", false)}
        >
          <span className="min-w-0 flex-1 truncate">All notes</span>
          <span className="text-xs opacity-70">{rows.length}</span>
        </button>
        {folderTree.map((entry) => {
          const active = typeof folderSelection === "object" && folderSelection.folder === entry.name;
          return (
            <div
              key={entry.name}
              className="group relative"
              style={{ paddingLeft: `${entry.depth * 0.9}rem` }}
              {...dropProps(entry.name)}
            >
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  setDraggedNoteId(null);
                  setDraggedFolderName(entry.name);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/folder-name", entry.name);
                }}
                onDragEnd={() => {
                  setDraggedFolderName(null);
                  setDragOverTarget(null);
                }}
                onClick={() => setFolderSelection({ folder: entry.name })}
                aria-pressed={active}
                className={`${folderRowClass(active, dragOverTarget === entry.name)} pr-10`}
              >
                <FontAwesomeIcon icon={faFolder} className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <span className="text-xs opacity-70">{countByFolder.total.get(entry.name) ?? 0}</span>
              </button>
              <FolderRowMenu
                folder={entry.name}
                active={active}
                onRename={() => openFolderModal({ mode: "rename", folder: entry.name })}
                onNewSubfolder={() => openFolderModal({ mode: "create", parent: entry.name })}
                onDelete={() => {
                  if (!window.confirm(`Delete "${entry.name}"? Notes inside move to Unfiled and subfolders move up a level.`)) return;
                  void deleteFolder(entry.name);
                }}
              />
            </div>
          );
        })}
        <div {...dropProps("__root__")}>
          <button
            type="button"
            onClick={() => setFolderSelection("unfiled")}
            aria-pressed={folderSelection === "unfiled"}
            className={folderRowClass(folderSelection === "unfiled", dragOverTarget === "__root__")}
          >
            <span className="min-w-0 flex-1 truncate">Unfiled</span>
            <span className="text-xs opacity-70">{countByFolder.unfiled}</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => openFolderModal({ mode: "create", parent: "" })}
          className={`${DASHED_BUTTON_CLASS} mt-1 w-full justify-center`}
        >
          <FontAwesomeIcon icon={faFolderPlus} className="h-3.5 w-3.5" aria-hidden="true" />
          Folder
        </button>
      </section>

      {allTags.length > 0 ? (
        <section className="space-y-2">
          <Eyebrow>Tags</Eyebrow>
          <div className="flex flex-wrap gap-1.5 px-1">
            {allTags.map((tag) => (
              <TagChip
                key={tag}
                tag={tag}
                size="sm"
                active={selectedTags.includes(tag)}
                onClick={() =>
                  setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel-card-soft mt-auto space-y-2 rounded-[1rem] p-3 text-xs">
        <div className="font-semibold text-foreground/70">
          {rows.length} {rows.length === 1 ? "note" : "notes"} · {folderNames.length} {folderNames.length === 1 ? "folder" : "folders"} ·{" "}
          {allTags.length} {allTags.length === 1 ? "tag" : "tags"}
        </div>
        <button
          type="button"
          onClick={() => void exportAllNotes()}
          disabled={isBulkExporting || rows.length === 0}
          className="surface-button inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border-2 px-3 text-xs disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faDownload} className="h-3 w-3" aria-hidden="true" />
          {isBulkExporting ? "Exporting…" : "Export all as markdown"}
        </button>
        <Link href="/help" className="block text-center text-[0.7rem] font-semibold text-foreground/55 underline underline-offset-2">
          Help with notes
        </Link>
      </section>
    </aside>
  );

  const listColumn = (
    <section className="flex min-h-0 flex-col gap-3" aria-label="Notes list">
      {isPhone ? newNoteButton : null}
      <label className="soft-input flex h-11 items-center gap-2 px-4" style={{ borderRadius: 999 }}>
        <FontAwesomeIcon icon={faMagnifyingGlass} className="h-3.5 w-3.5 text-foreground/55" aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search notes"
          aria-label="Search notes"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/50"
        />
        {search ? (
          <button type="button" onClick={() => setSearch("")} className="text-xs font-bold text-foreground/60 hover:text-foreground">
            Clear
          </button>
        ) : null}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {isPhone ? (
          <select
            aria-label="Folder"
            value={folderSelection === "all" ? "all" : folderSelection === "unfiled" ? "unfiled" : `folder:${folderSelection.folder}`}
            onChange={(event) => {
              const value = event.target.value;
              setFolderSelection(value === "all" ? "all" : value === "unfiled" ? "unfiled" : { folder: value.slice("folder:".length) });
            }}
            className="soft-input h-9 max-w-[45%] px-3 text-sm font-semibold"
            style={{ borderRadius: 999 }}
          >
            <option value="all">All notes ({rows.length})</option>
            {folderTree.map((entry) => (
              <option key={entry.name} value={`folder:${entry.name}`}>
                {`${"  ".repeat(entry.depth)}${entry.name} (${countByFolder.total.get(entry.name) ?? 0})`}
              </option>
            ))}
            <option value="unfiled">Unfiled ({countByFolder.unfiled})</option>
          </select>
        ) : null}
        <div className="segmented-control ml-auto" role="group" aria-label="Sort notes">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              data-active={sort === option.key ? "true" : "false"}
              aria-pressed={sort === option.key}
              onClick={() => setSort(option.key)}
              className="segmented-control-button text-xs"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {selectedTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-foreground/60">Tagged</span>
          {selectedTags.map((tag) => (
            <TagChip key={tag} tag={tag} size="sm" onRemove={() => setSelectedTags((prev) => prev.filter((item) => item !== tag))} />
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 lg:overflow-y-auto lg:pr-1 lg:pb-2">
        {rows.length === 0 && !isLoading ? (
          <NoNotesYet size="page" onCreate={() => void onCreateNewNote()} busy={busy} />
        ) : visibleRows.length === 0 ? (
          <p className="rounded-[1rem] border-2 border-dashed border-[color:var(--surface-border)] px-4 py-6 text-center text-sm text-foreground/65">
            No notes match.
          </p>
        ) : (
          visibleRows.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              folderPath={buildFolderPath(noteFolderMap[note.id] ?? "", folderParentMap)}
              isActive={note.id === activeDraftId}
              isDragging={draggedNoteId === note.id}
              onOpen={() => void openNote(note.id)}
              onDragStart={(event) => {
                setDraggedFolderName(null);
                setDraggedNoteId(note.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/note-id", note.id);
              }}
              onDragEnd={() => {
                setDraggedNoteId(null);
                setDragOverTarget(null);
              }}
            />
          ))
        )}
      </div>
    </section>
  );

  const editorColumn = (
    <section className="panel-card flex min-h-[24rem] flex-col overflow-hidden rounded-[20px] lg:min-h-0" aria-label="Note editor">
      {activeDraft ? (
        <>
          <header className="flex shrink-0 items-center gap-2 border-b-2 border-[color:var(--surface-border)] bg-[color:var(--accent-note)] px-3 py-2.5">
            {isPhone ? (
              <button
                type="button"
                onClick={() => setMobileView("list")}
                aria-label="Back to the list"
                className={ICON_BUTTON_CLASS}
              >
                <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <LightbulbBadge />
            )}
            <input
              ref={titleInputRef}
              value={titleDraft}
              readOnly={readOnly}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  setTitleDraft(activeDraft.title);
                  event.currentTarget.blur();
                }
              }}
              aria-label="Note title"
              placeholder="Untitled note"
              className="min-w-0 flex-1 rounded-[0.8rem] border-2 border-transparent bg-transparent px-2 py-1 font-display text-lg font-extrabold tracking-[-0.02em] text-foreground outline-none placeholder:text-foreground/45 focus:border-[color:var(--surface-border)] focus:bg-[color:var(--surface-card)]"
            />
            <StatusPill note={activeDraft} className="hidden sm:inline-flex" />
            <ShareButton note={activeSummary} placement="below" align="right" openSignal={shareSignal} />
            <NoteOptionsMenu
              note={activeSummary}
              currentFolder={noteFolderMap[activeDraft.id] ?? ""}
              folderTree={folderTree}
              onRename={() => titleInputRef.current?.select()}
              onMoveToFolder={(folderName) => void assignFolder(activeDraft.id, folderName)}
              onVisibility={() => setShareSignal((n) => n + 1)}
              onDelete={onDeleteActive}
            />
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <NoteTagChips note={activeDraft} readOnly={readOnly} />
              <SaveStatusLabel className="ml-auto" />
            </div>
            {readOnly ? (
              <p className="rounded-[0.8rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--accent-mint)] px-3 py-2 text-xs font-semibold">
                This note is published, so it can no longer be edited.
              </p>
            ) : null}
            <NoteBlockList blocks={activeDraft.blocks} readOnly={readOnly} focusToken={focusToken} />
            {!readOnly ? (
              <div className="rounded-[1rem] border-2 border-dashed border-[color:var(--surface-border)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void onWrite()} disabled={busy} className={DASHED_BUTTON_CLASS}>
                    <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
                    Write
                  </button>
                  <button type="button" onClick={() => void onQuote()} disabled={busy} className={DASHED_BUTTON_CLASS}>
                    <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
                    Quote
                  </button>
                  <Link href="/browse" className={DASHED_BUTTON_CLASS} title="Open a chapter, select verses, and tap Add to note">
                    <FontAwesomeIcon icon={faBook} className="h-3 w-3" aria-hidden="true" />
                    Scripture
                  </Link>
                  <Link href="/browse" className={DASHED_BUTTON_CLASS} title="Select a word in the reader, tap Explore, then Add to note">
                    <FontAwesomeIcon icon={faSpellCheck} className="h-3 w-3" aria-hidden="true" />
                    Definition
                  </Link>
                </div>
                <p className="mt-2 text-[0.72rem] text-foreground/55">
                  Scriptures and definitions come from the reader: select verses or a word there and tap <strong>Add to note</strong>. They land in this note.
                </p>
              </div>
            ) : null}
            {!readOnly ? <AiInsightAssistant draft={activeDraft} onAddTextBlock={addTextBlock} /> : null}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <LightbulbBadge size="lg" />
          {isLoading && activeDraftId ? (
            <p className="text-sm text-foreground/65">Loading note…</p>
          ) : (
            <>
              <p className="font-display text-lg font-extrabold tracking-[-0.02em]">Pick a note</p>
              <p className="max-w-xs text-sm text-foreground/65">Choose one from the list, or start a new one.</p>
              <button type="button" onClick={() => void onCreateNewNote()} disabled={busy} className={`${DASHED_BUTTON_CLASS} h-10`}>
                <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
                New note
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-2.5 px-1 font-display text-[1.6rem] font-extrabold tracking-[-0.03em] sm:text-[1.9rem]">
          <LightbulbBadge />
          Notes
        </h1>
        <AccountControl variant="page" />
      </div>

      {isPhone ? (
        mobileView === "editor" && activeDraftId ? (
          editorColumn
        ) : (
          listColumn
        )
      ) : (
        <div className="grid min-h-0 gap-4 lg:h-[calc(100vh-var(--header-height)-7.5rem)] lg:grid-cols-[220px_340px_minmax(0,1fr)]">
          {leftColumn}
          {listColumn}
          {editorColumn}
        </div>
      )}

      {folderModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4" role="dialog" aria-modal="true" aria-label={folderModal.mode === "create" ? "New folder" : "Rename folder"}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitFolderModal();
            }}
            className="panel-card-strong w-full max-w-md space-y-3 rounded-[1.25rem] p-5"
          >
            <h2 className="font-display text-lg font-extrabold tracking-[-0.02em]">{folderModal.mode === "create" ? "New folder" : "Rename folder"}</h2>
            <input
              autoFocus
              value={folderModalName}
              onChange={(event) => setFolderModalName(event.target.value)}
              placeholder="Folder name"
              aria-label="Folder name"
              className="soft-input w-full px-3 py-2 text-sm outline-none"
            />
            {folderModal.mode === "create" ? (
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-foreground/70">Inside</span>
                <select
                  value={folderModalParent}
                  onChange={(event) => setFolderModalParent(event.target.value)}
                  className="soft-input w-full px-3 py-2 text-sm"
                >
                  <option value="">No folder (top level)</option>
                  {folderTree.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {`${"  ".repeat(entry.depth)}${entry.name}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {folderModalName.trim() && folderNames.includes(folderModalName.trim()) && folderModalName.trim() !== (folderModal.mode === "rename" ? folderModal.folder : "") ? (
              <p className="text-xs font-semibold" style={{ color: "color-mix(in srgb, var(--accent-coral) 70%, var(--foreground))" }}>
                A folder with that name already exists.
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setFolderModal(null)} className="surface-button rounded-full border-2 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!folderModalName.trim()}
                className="rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 py-2 text-sm font-bold text-[color:var(--surface-button-active-text)] disabled:opacity-50"
              >
                {folderModal.mode === "create" ? "Create folder" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FolderRowMenu({
  folder,
  active,
  onRename,
  onNewSubfolder,
  onDelete,
}: {
  folder: string;
  active: boolean;
  onRename: () => void;
  onNewSubfolder: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div
      className={`absolute right-1 top-1/2 -translate-y-1/2 ${
        open ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
      }`}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Options for folder ${folder}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] ${
          active ? "bg-[color:var(--surface-card)] text-foreground" : "bg-[color:var(--surface-card)] text-foreground/70"
        } hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]`}
      >
        <FontAwesomeIcon icon={faEllipsis} className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <Popover open={open} onClose={close} triggerRef={triggerRef} label={`Folder ${folder}`} align="right" className="w-48">
        <MenuItem
          onSelect={() => {
            close();
            onRename();
          }}
        >
          Rename
        </MenuItem>
        <MenuItem
          onSelect={() => {
            close();
            onNewSubfolder();
          }}
        >
          New subfolder
        </MenuItem>
        <div className="my-1 border-t-2 border-[color:var(--surface-border)]" />
        <MenuItem
          danger
          onSelect={() => {
            close();
            onDelete();
          }}
        >
          Delete folder
        </MenuItem>
      </Popover>
    </div>
  );
}

function NoteCard({
  note,
  folderPath,
  isActive,
  isDragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  note: InsightDraftSummary;
  folderPath: string;
  isActive: boolean;
  isDragging: boolean;
  onOpen: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const refs = note.scripture_refs ?? [];
  const shownRefs = refs.slice(0, 3);
  const extraRefs = refs.length - shownRefs.length;
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`interactive-card rounded-[1rem] border-2 border-[color:var(--surface-border)] ${
        isActive ? "shadow-[var(--surface-shadow)]" : "shadow-none"
      } ${isDragging ? "opacity-50" : ""}`}
      style={{ background: isActive ? "var(--accent-note)" : "var(--surface-card)" }}
      aria-current={isActive ? "true" : undefined}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full cursor-pointer rounded-[1rem] px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
      >
        <div className="flex items-start gap-2">
          <LightbulbBadge size="sm" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-[0.98rem] font-extrabold leading-tight tracking-[-0.02em]">{note.title || "Untitled note"}</h3>
            {note.excerpt ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground/70">{note.excerpt}</p> : null}
            {shownRefs.length > 0 || folderPath ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {shownRefs.map((reference) => (
                  <span
                    key={reference}
                    className="rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] px-1.5 text-[0.62rem] font-bold leading-4"
                  >
                    {reference}
                  </span>
                ))}
                {extraRefs > 0 ? <span className="text-[0.66rem] font-bold text-foreground/60">+{extraRefs}</span> : null}
                {folderPath ? (
                  <span className="ml-auto truncate text-[0.66rem] font-semibold text-foreground/55">
                    <FontAwesomeIcon icon={faFolder} className="mr-1 h-2.5 w-2.5" aria-hidden="true" />
                    {folderPath}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <StatusPill note={note} />
        </div>
      </button>
    </article>
  );
}
