"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/lib/auth";
import { getInsightDraft, type InsightDraftSummary } from "@/lib/appData";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";

const FOLDER_NAMES_KEY = "vt_note_folder_names_v1";
const NOTE_FOLDER_MAP_KEY = "vt_note_folder_map_v1";
const FOLDER_PARENT_MAP_KEY = "vt_folder_parent_map_v1";
const EXPANDED_FOLDERS_KEY = "vt_expanded_folders_v1";
const NOTES_TIP_DISMISSED_KEY = "vt_notes_tip_dismissed_v1";

type FolderParentMap = Record<string, string>;
type SearchFilter = {
  id: string;
  kind: "tag" | "uncategorized" | "hasFolder" | "folder" | "draft" | "public";
  label: string;
  value?: string;
};
type FilterOption = {
  key: string;
  group: "quick" | "tag" | "folder";
  filter: SearchFilter;
  keywords: string;
};

function loadFolderNames(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FOLDER_NAMES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 100);
  } catch {
    return [];
  }
}

function saveFolderNames(names: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FOLDER_NAMES_KEY, JSON.stringify(names));
  } catch {}
}

function loadNoteFolderMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NOTE_FOLDER_MAP_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function saveNoteFolderMap(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTE_FOLDER_MAP_KEY, JSON.stringify(map));
  } catch {}
}

function loadFolderParentMap(): FolderParentMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FOLDER_PARENT_MAP_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: FolderParentMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const child = String(key).trim();
      const parent = String(value ?? "").trim();
      if (!child || !parent || child === parent) continue;
      out[child] = parent;
    }
    return out;
  } catch {
    return {};
  }
}

function saveFolderParentMap(map: FolderParentMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FOLDER_PARENT_MAP_KEY, JSON.stringify(map));
  } catch {}
}

function loadExpandedFolders(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EXPANDED_FOLDERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const name = String(key).trim();
      if (!name) continue;
      out[name] = !!value;
    }
    return out;
  } catch {
    return {};
  }
}

function saveExpandedFolders(map: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify(map));
  } catch {}
}

function visibilityLabel(visibility: InsightDraftSummary["visibility"]) {
  if (visibility === "friends") return "Friends";
  if (visibility === "link") return "Link";
  if (visibility === "public") return "Public";
  return "Private";
}

function getTagChipStyle(tag: string) {
  const palette = [
    { backgroundColor: "rgba(59, 130, 246, 0.2)", borderColor: "rgba(96, 165, 250, 0.55)" }, // blue
    { backgroundColor: "rgba(34, 197, 94, 0.2)", borderColor: "rgba(74, 222, 128, 0.55)" }, // green
    { backgroundColor: "rgba(244, 63, 94, 0.2)", borderColor: "rgba(251, 113, 133, 0.55)" }, // rose
    { backgroundColor: "rgba(245, 158, 11, 0.2)", borderColor: "rgba(251, 191, 36, 0.6)" }, // amber
    { backgroundColor: "rgba(168, 85, 247, 0.2)", borderColor: "rgba(196, 181, 253, 0.6)" }, // violet
    { backgroundColor: "rgba(14, 165, 233, 0.2)", borderColor: "rgba(56, 189, 248, 0.6)" }, // sky
    { backgroundColor: "rgba(234, 88, 12, 0.2)", borderColor: "rgba(251, 146, 60, 0.6)" }, // orange
    { backgroundColor: "rgba(20, 184, 166, 0.2)", borderColor: "rgba(45, 212, 191, 0.6)" }, // teal
    { backgroundColor: "rgba(236, 72, 153, 0.2)", borderColor: "rgba(244, 114, 182, 0.6)" }, // pink
    { backgroundColor: "rgba(99, 102, 241, 0.2)", borderColor: "rgba(129, 140, 248, 0.6)" }, // indigo
    { backgroundColor: "rgba(132, 204, 22, 0.2)", borderColor: "rgba(163, 230, 53, 0.6)" }, // lime
    { backgroundColor: "rgba(239, 68, 68, 0.2)", borderColor: "rgba(248, 113, 113, 0.6)" }, // red
  ];

  let hash = 2166136261;
  for (let i = 0; i < tag.length; i += 1) {
    hash ^= tag.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return palette[(hash >>> 0) % palette.length];
}

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

export default function NotesWorkspace({
  searchAsHeaderExtension = false,
  showTitleBelowSearch = false,
}: {
  searchAsHeaderExtension?: boolean;
  showTitleBelowSearch?: boolean;
}) {
  const { user, getToken, loading } = useAuth();
  const rows = useQuery(api.insights.listMyDrafts, user ? {} : "skip") as InsightDraftSummary[] | undefined;
  const saveDraftSettingsMutation = useMutation(api.insights.saveDraftSettings);
  const { switchDraft, openBuilder, createDraft } = useInsightBuilder();

  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<SearchFilter[]>([]);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [highlightedFilterIndex, setHighlightedFilterIndex] = useState(0);
  const [folderNames, setFolderNames] = useState<string[]>([]);
  const [noteFolderMap, setNoteFolderMap] = useState<Record<string, string>>({});
  const [folderParentMap, setFolderParentMap] = useState<FolderParentMap>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParent, setNewFolderParent] = useState<string>("");
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [draggedFolderName, setDraggedFolderName] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | "__root__" | null>(null);
  const [showTipsTooltip, setShowTipsTooltip] = useState(false);
  const [tagSavingById, setTagSavingById] = useState<Record<string, boolean>>({});
  const noteDropHandledRef = useRef(false);
  const filterBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFolderNames(loadFolderNames());
    setNoteFolderMap(loadNoteFolderMap());
    setFolderParentMap(loadFolderParentMap());
    setExpandedFolders(loadExpandedFolders());
    try {
      setShowTipsTooltip(!window.localStorage.getItem(NOTES_TIP_DISMISSED_KEY));
    } catch {
      setShowTipsTooltip(true);
    }
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!isFilterMenuOpen) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (filterBoxRef.current?.contains(target)) return;
      setIsFilterMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("touchstart", onPointerDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("touchstart", onPointerDown);
    };
  }, [isFilterMenuOpen]);

  const allTags = useMemo(() => {
    if (!rows) return [];
    const tags = new Set<string>();
    for (const row of rows) {
      for (const tag of row.tags ?? []) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const allFolders = useMemo(() => {
    const names = new Set(folderNames);
    Object.values(noteFolderMap).forEach((name) => {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    });
    Object.keys(folderParentMap).forEach((name) => {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    });
    Object.values(folderParentMap).forEach((name) => {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [folderNames, noteFolderMap, folderParentMap]);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const folder = noteFolderMap[row.id] ?? "";
      const titleMatch = !q || row.title.toLowerCase().includes(q);
      if (!titleMatch) return false;
      return activeFilters.every((filter) => {
        if (filter.kind === "tag") return (row.tags ?? []).includes(filter.value ?? "");
        if (filter.kind === "folder") return folder === (filter.value ?? "");
        if (filter.kind === "uncategorized") return !folder;
        if (filter.kind === "hasFolder") return !!folder;
        if (filter.kind === "draft") return row.status === "draft";
        if (filter.kind === "public") return row.visibility === "public";
        return true;
      });
    });
  }, [rows, search, noteFolderMap, activeFilters]);

  const filterOptions = useMemo<FilterOption[]>(() => {
    const quick: FilterOption[] = [
      {
        key: "quick:uncategorized",
        group: "quick",
        filter: { id: "uncategorized", kind: "uncategorized", label: "Uncategorized notes" },
        keywords: "uncategorized no folder root",
      },
      {
        key: "quick:has-folder",
        group: "quick",
        filter: { id: "has-folder", kind: "hasFolder", label: "Has folder" },
        keywords: "has folder categorized",
      },
      {
        key: "quick:draft",
        group: "quick",
        filter: { id: "draft", kind: "draft", label: "Draft notes" },
        keywords: "draft",
      },
      {
        key: "quick:public",
        group: "quick",
        filter: { id: "public", kind: "public", label: "Public notes" },
        keywords: "public shared",
      },
    ];
    const tags = allTags.map<FilterOption>((tag) => ({
      key: `tag:${tag}`,
      group: "tag",
      filter: { id: `tag:${tag}`, kind: "tag", label: `Tag: ${tag}`, value: tag },
      keywords: `tag ${tag}`,
    }));
    const folders = allFolders.map<FilterOption>((folder) => ({
      key: `folder:${folder}`,
      group: "folder",
      filter: { id: `folder:${folder}`, kind: "folder", label: `In folder: ${folder}`, value: folder },
      keywords: `folder ${folder}`,
    }));
    return [...quick, ...tags, ...folders];
  }, [allTags, allFolders]);

  const visibleFilterOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filterOptions;
    return filterOptions.filter((opt) => {
      const label = opt.filter.label.toLowerCase();
      return label.includes(q) || opt.keywords.toLowerCase().includes(q);
    });
  }, [filterOptions, search]);

  useEffect(() => {
    if (!isFilterMenuOpen) return;
    if (visibleFilterOptions.length === 0) {
      setHighlightedFilterIndex(0);
      return;
    }
    setHighlightedFilterIndex((prev) => {
      if (prev < 0) return 0;
      if (prev >= visibleFilterOptions.length) return visibleFilterOptions.length - 1;
      return prev;
    });
  }, [isFilterMenuOpen, visibleFilterOptions]);

  const normalizedParentMap = useMemo(() => {
    const valid = new Set(allFolders);
    const out: FolderParentMap = {};
    for (const folder of allFolders) {
      const parent = folderParentMap[folder];
      if (!parent || !valid.has(parent) || parent === folder) continue;
      if (isDescendant(parent, folder, folderParentMap)) continue;
      out[folder] = parent;
    }
    return out;
  }, [allFolders, folderParentMap]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, string[]>();
    map.set(null, []);
    for (const folder of allFolders) map.set(folder, []);
    for (const folder of allFolders) {
      const parent = normalizedParentMap[folder] ?? null;
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(folder);
    }
    map.forEach((children) => children.sort((a, b) => a.localeCompare(b)));
    return map;
  }, [allFolders, normalizedParentMap]);

  const rootFolders = useMemo(() => childrenByParent.get(null) ?? [], [childrenByParent]);

  const notesByFolder = useMemo(() => {
    const map = new Map<string, InsightDraftSummary[]>();
    for (const folder of allFolders) map.set(folder, []);
    const unfiled: InsightDraftSummary[] = [];

    for (const note of filteredRows) {
      const folder = noteFolderMap[note.id];
      if (folder && map.has(folder)) {
        map.get(folder)!.push(note);
      } else {
        unfiled.push(note);
      }
    }

    map.forEach((arr) => arr.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    unfiled.sort((a, b) => b.updated_at.localeCompare(a.updated_at));

    return { map, unfiled };
  }, [allFolders, filteredRows, noteFolderMap]);

  const folderOptions = useMemo(() => {
    const out: Array<{ name: string; depth: number }> = [];
    function walk(folder: string, depth: number) {
      out.push({ name: folder, depth });
      const children = childrenByParent.get(folder) ?? [];
      children.forEach((child) => walk(child, depth + 1));
    }
    rootFolders.forEach((folder) => walk(folder, 0));
    return out;
  }, [childrenByParent, rootFolders]);

  function toggleFolder(folder: string) {
    setExpandedFolders((prev) => {
      const next = { ...prev, [folder]: !(prev[folder] ?? true) };
      saveExpandedFolders(next);
      return next;
    });
  }

  function upsertFolder(name: string, parent?: string | null) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (allFolders.includes(trimmed)) return false;

    const nextNames = [...allFolders, trimmed].sort((a, b) => a.localeCompare(b));
    setFolderNames(nextNames);
    saveFolderNames(nextNames);

    if (parent) {
      const nextParents = { ...folderParentMap, [trimmed]: parent };
      setFolderParentMap(nextParents);
      saveFolderParentMap(nextParents);
    }

    setExpandedFolders((prev) => {
      const next = { ...prev, [trimmed]: true };
      saveExpandedFolders(next);
      return next;
    });
    return true;
  }

  function assignFolder(noteId: string, folder: string | null) {
    const nextMap = { ...noteFolderMap };
    if (!folder) {
      delete nextMap[noteId];
    } else {
      nextMap[noteId] = folder;
    }
    setNoteFolderMap(nextMap);
    saveNoteFolderMap(nextMap);
  }

  function moveFolder(folder: string, targetParent: string | null) {
    if (!folder) return;
    if (targetParent === folder) return;
    if (targetParent && isDescendant(targetParent, folder, normalizedParentMap)) return;

    const nextParents = { ...folderParentMap };
    if (!targetParent) {
      delete nextParents[folder];
    } else {
      nextParents[folder] = targetParent;
    }
    setFolderParentMap(nextParents);
    saveFolderParentMap(nextParents);
  }

  function deleteFolder(folder: string) {
    const name = folder.trim();
    if (!name) return;

    const nextNames = allFolders.filter((value) => value !== name);
    setFolderNames(nextNames);
    saveFolderNames(nextNames);

    const nextNoteFolderMap: Record<string, string> = {};
    for (const [noteId, value] of Object.entries(noteFolderMap)) {
      if (value === name) continue;
      nextNoteFolderMap[noteId] = value;
    }
    setNoteFolderMap(nextNoteFolderMap);
    saveNoteFolderMap(nextNoteFolderMap);

    const nextParentMap: FolderParentMap = {};
    for (const [child, parent] of Object.entries(folderParentMap)) {
      if (child === name) continue;
      if (parent === name) continue;
      nextParentMap[child] = parent;
    }
    setFolderParentMap(nextParentMap);
    saveFolderParentMap(nextParentMap);

    setExpandedFolders((prev) => {
      const out = { ...prev };
      delete out[name];
      saveExpandedFolders(out);
      return out;
    });
    setActiveFilters((prev) => prev.filter((filter) => !(filter.kind === "folder" && filter.value === name)));
  }

  function renameFolder(from: string, to: string) {
    const fromName = from.trim();
    const toName = to.trim();
    if (!fromName || !toName) return false;
    if (fromName === toName) return true;
    if (allFolders.includes(toName)) return false;

    const nextNames = allFolders
      .map((folder) => (folder === fromName ? toName : folder))
      .sort((a, b) => a.localeCompare(b));
    setFolderNames(nextNames);
    saveFolderNames(nextNames);

    const nextNoteFolderMap: Record<string, string> = {};
    for (const [noteId, folder] of Object.entries(noteFolderMap)) {
      nextNoteFolderMap[noteId] = folder === fromName ? toName : folder;
    }
    setNoteFolderMap(nextNoteFolderMap);
    saveNoteFolderMap(nextNoteFolderMap);

    const nextParentMap: FolderParentMap = {};
    for (const [child, parent] of Object.entries(folderParentMap)) {
      const nextChild = child === fromName ? toName : child;
      const nextParent = parent === fromName ? toName : parent;
      if (!nextChild || !nextParent || nextChild === nextParent) continue;
      nextParentMap[nextChild] = nextParent;
    }
    setFolderParentMap(nextParentMap);
    saveFolderParentMap(nextParentMap);

    setExpandedFolders((prev) => {
      const out = { ...prev };
      if (fromName in out) {
        out[toName] = out[fromName];
        delete out[fromName];
      }
      saveExpandedFolders(out);
      return out;
    });

    setActiveFilters((prev) =>
      prev.map((filter) =>
        filter.kind === "folder" && filter.value === fromName
          ? {
              ...filter,
              id: `folder:${toName}`,
              label: `In folder: ${toName}`,
              value: toName,
            }
          : filter
      )
    );
    return true;
  }

  async function saveNoteTags(noteId: string, tags: string[]) {
    const normalized = Array.from(
      new Set(
        tags
          .map((tag) => tag.trim().replace(/^#+/, "").toLowerCase())
          .filter(Boolean)
      )
    ).slice(0, 20);
    setTagSavingById((prev) => ({ ...prev, [noteId]: true }));
    try {
      await saveDraftSettingsMutation({
        draftId: noteId as any,
        tags: normalized,
      });
    } finally {
      setTagSavingById((prev) => ({ ...prev, [noteId]: false }));
    }
  }

  function addFilter(filter: SearchFilter) {
    setActiveFilters((prev) => {
      if (prev.some((f) => f.id === filter.id)) return prev;
      return [...prev, filter];
    });
    setIsFilterMenuOpen(false);
  }

  function removeFilter(filterId: string) {
    setActiveFilters((prev) => prev.filter((f) => f.id !== filterId));
  }

  function applyHighlightedFilter() {
    if (visibleFilterOptions.length === 0) return;
    const clamped = Math.max(0, Math.min(highlightedFilterIndex, visibleFilterOptions.length - 1));
    addFilter(visibleFilterOptions[clamped].filter);
    setSearch("");
    setHighlightedFilterIndex(0);
  }

  async function onCreateNewNote() {
    setIsMenuOpen(false);
    const createdId = await createDraft("New note");
    if (!createdId) return;
    await switchDraft(createdId);
    openBuilder();
  }

  function onOpenNewFolderModal() {
    setIsMenuOpen(false);
    setNewFolderName("");
    setNewFolderParent("");
    setIsFolderModalOpen(true);
  }

  function onDismissTips() {
    setShowTipsTooltip(false);
    try {
      window.localStorage.setItem(NOTES_TIP_DISMISSED_KEY, "1");
    } catch {}
  }

  async function exportNote(noteId: string, fallbackTitle: string) {
    if (!user) return;
    setExportingId(noteId);
    try {
      const token = await getToken({ template: "convex" });
      if (!token) return;
      const draft = await getInsightDraft(token, noteId);
      const fileBody = toMarkdownFromDraft(draft);
      const blob = new Blob([fileBody], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const safeTitle = (draft.title || fallbackTitle || "note").replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeTitle || "note"}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportingId(null);
    }
  }

  async function exportAllNotes() {
    if (!user || !rows || rows.length === 0) return;
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
        const folder = noteFolderMap[row.id] ?? "Root";
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

  function renderFolderNode(folder: string, depth: number) {
    const notes = notesByFolder.map.get(folder) ?? [];
    const expanded = expandedFolders[folder] ?? true;
    const children = childrenByParent.get(folder) ?? [];
    const isDropTarget = dragOverFolder === folder;

    return (
      <section
        key={folder}
        onDragOver={(e) => {
          if (!draggedNoteId && !draggedFolderName) return;
          e.preventDefault();
          e.stopPropagation();
          setDragOverFolder(folder);
        }}
        onDragLeave={() => {
          if (dragOverFolder === folder) setDragOverFolder(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const noteId = draggedNoteId || e.dataTransfer.getData("text/note-id");
          const draggedFolder = draggedFolderName || e.dataTransfer.getData("text/folder-name");

          if (noteId) {
            assignFolder(noteId, folder);
            noteDropHandledRef.current = true;
          }
          else if (draggedFolder) moveFolder(draggedFolder, folder);

          setDraggedNoteId(null);
          setDraggedFolderName(null);
          setDragOverFolder(null);
        }}
        className={`rounded-lg border p-3 transition-colors ${
          isDropTarget
            ? "border-sky-500 bg-sky-500/10"
            : "surface-card"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => toggleFolder(folder)}
              className="flex-1 text-left"
            >
            <span className="font-medium">
              {expanded ? "▾" : "▸"} {folder}
            </span>
              <span className="ml-2 text-xs text-foreground/60">{notes.length} notes</span>
            </button>
          <button
            onClick={() => {
              setRenamingFolder(folder);
              setRenameFolderName(folder);
            }}
            className="rounded-md border surface-button px-2 py-0.5 text-xs"
            title={`Rename folder ${folder}`}
            aria-label={`Rename folder ${folder}`}
          >
            Rename
          </button>
          <button
            onClick={() => {
              const confirmed = window.confirm(
                `Delete "${folder}"? Notes in this folder will move to root and child folders will move to root.`
              );
              if (!confirmed) return;
              deleteFolder(folder);
            }}
            className="rounded-md border surface-button px-2 py-0.5 text-xs text-red-700 dark:text-red-300"
            title={`Delete folder ${folder}`}
            aria-label={`Delete folder ${folder}`}
          >
            Delete
          </button>
          <span
            draggable
            onDragStart={(e) => {
              setDraggedNoteId(null);
              setDraggedFolderName(folder);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/folder-name", folder);
            }}
            onDragEnd={() => {
              setDraggedFolderName(null);
              setDragOverFolder(null);
            }}
            className="cursor-grab text-foreground/50 px-1"
            title="Drag folder"
            aria-label={`Drag folder ${folder}`}
          >
            ::
          </span>
        </div>

        {expanded ? (
          <div className="mt-2 space-y-2">
            {notes.length === 0 && children.length === 0 ? <p className="text-xs text-foreground/60">Drop notes or folders here.</p> : null}
            {notes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                isDragging={draggedNoteId === note.id}
                onDragStart={(noteId, event) => {
                  setDraggedFolderName(null);
                  setDraggedNoteId(noteId);
                  noteDropHandledRef.current = false;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/note-id", noteId);
                }}
                onDragEnd={(noteId) => {
                  if (!noteDropHandledRef.current) {
                    assignFolder(noteId, null);
                  }
                  setDraggedNoteId(null);
                  setDragOverFolder(null);
                }}
                onEdit={async () => {
                  await switchDraft(note.id);
                  openBuilder();
                }}
              onExport={() => {
                void exportNote(note.id, note.title);
              }}
              exporting={exportingId === note.id}
              onSaveTags={(tags) => {
                void saveNoteTags(note.id, tags);
              }}
              tagsSaving={!!tagSavingById[note.id]}
            />
          ))}
            {children.map((child) => renderFolderNode(child, depth + 1))}
          </div>
        ) : null}
      </section>
    );
  }

  if (loading) {
    return <div className="mx-auto max-w-5xl text-sm text-foreground/70">Loading notes...</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border surface-card p-5 space-y-3">
        <h2 className="text-xl font-semibold">Sign in to use Notes</h2>
        <p className="text-sm text-foreground/70">
          Your notes workspace includes folders, tags, exports, and quick actions back into the note editor.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/browse" className="rounded-md border surface-button px-3 py-2 text-sm">
            Browse scriptures
          </Link>
          <Link href="/auth" className="rounded-md bg-foreground text-background px-3 py-2 text-sm">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-24">
      <div
        ref={filterBoxRef}
        className={`border surface-card p-2 space-y-2 ${
          searchAsHeaderExtension ? "rounded-b-xl rounded-t-none border-t-0 -mt-4" : "rounded-lg"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <div className="flex min-h-[36px] w-full flex-wrap items-center gap-1 rounded-md border surface-card-soft bg-transparent px-2 py-0.5">
              {activeFilters.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => removeFilter(filter.id)}
                className="inline-flex items-center gap-1 rounded-full border surface-button px-2 py-0.5 text-[11px]"
                title="Remove filter"
              >
                  <span>{filter.label}</span>
                  <span>x</span>
                </button>
              ))}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setIsFilterMenuOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsFilterMenuOpen(false);
                    return;
                  }
                  if (e.key === "Backspace" && search.length === 0 && activeFilters.length > 0) {
                    const last = activeFilters[activeFilters.length - 1];
                    removeFilter(last.id);
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (!isFilterMenuOpen) setIsFilterMenuOpen(true);
                    if (visibleFilterOptions.length > 0) {
                      setHighlightedFilterIndex((prev) => (prev + 1) % visibleFilterOptions.length);
                    }
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (!isFilterMenuOpen) setIsFilterMenuOpen(true);
                    if (visibleFilterOptions.length > 0) {
                      setHighlightedFilterIndex((prev) => (prev - 1 + visibleFilterOptions.length) % visibleFilterOptions.length);
                    }
                    return;
                  }
                  if (e.key === "Enter" && isFilterMenuOpen) {
                    e.preventDefault();
                    applyHighlightedFilter();
                  }
                }}
                placeholder="Search notes..."
                className="min-w-[140px] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
              />
            </div>
            {isFilterMenuOpen ? (
              <div className="absolute left-0 top-[calc(100%+0.35rem)] z-20 w-full max-h-80 overflow-auto rounded-md border surface-card-strong shadow-lg p-2 space-y-2">
                {visibleFilterOptions.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-foreground/60">No matching filters.</div>
                ) : (
                  <div className="space-y-1">
                    {visibleFilterOptions.map((option, idx) => (
                      <button
                        key={option.key}
                        onMouseEnter={() => setHighlightedFilterIndex(idx)}
                        onClick={() => {
                          addFilter(option.filter);
                          setSearch("");
                          setHighlightedFilterIndex(0);
                        }}
                        className={`w-full rounded-md px-2.5 py-2 text-left text-xs ${
                          idx === highlightedFilterIndex
                            ? "bg-foreground text-background"
                            : "border surface-button"
                        }`}
                      >
                        {option.filter.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          {activeFilters.length > 0 ? (
            <button
              onClick={() => setActiveFilters([])}
              className="rounded-md border surface-button px-3 py-1.5 text-sm"
            >
              Clear
            </button>
          ) : null}
          <button
            onClick={() => {
              void exportAllNotes();
            }}
            disabled={isBulkExporting || !rows || rows.length === 0}
            className="rounded-md border surface-button px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {isBulkExporting ? "Exporting all..." : "Export all notes"}
          </button>
        </div>
      </div>

      {showTitleBelowSearch ? (
        <div className="rounded-xl border surface-card p-4 sm:p-5">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Notes</h1>
          <p className="mt-1 text-sm text-foreground/70">
            Organize your scripture notes with folders and tags, then export when you need to share or archive.
          </p>
        </div>
      ) : null}

      {rows === undefined ? <p className="text-sm text-foreground/70">Loading notes...</p> : null}
      {rows !== undefined && rows.length === 0 ? <p className="text-sm text-foreground/70">No saved notes yet.</p> : null}
      {rows !== undefined && rows.length > 0 && filteredRows.length === 0 ? (
        <p className="text-sm text-foreground/70">No notes match your current filters.</p>
      ) : null}

      <div
        onDragOver={(e) => {
          if (!draggedNoteId && !draggedFolderName) return;
          e.preventDefault();
          setDragOverFolder("__root__");
        }}
        onDragLeave={() => {
          if (dragOverFolder === "__root__") setDragOverFolder(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const noteId = draggedNoteId || e.dataTransfer.getData("text/note-id");
          const folderName = draggedFolderName || e.dataTransfer.getData("text/folder-name");
          if (noteId) assignFolder(noteId, null);
          else if (folderName) moveFolder(folderName, null);
          if (noteId) noteDropHandledRef.current = true;
          setDraggedNoteId(null);
          setDraggedFolderName(null);
          setDragOverFolder(null);
        }}
        className={`space-y-2 ${dragOverFolder === "__root__" ? "rounded-lg ring-2 ring-sky-500/70 ring-offset-2 ring-offset-background p-1" : ""}`}
      >
        {notesByFolder.unfiled.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            isDragging={draggedNoteId === note.id}
            onDragStart={(noteId, event) => {
              setDraggedFolderName(null);
              setDraggedNoteId(noteId);
              noteDropHandledRef.current = false;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/note-id", noteId);
            }}
            onDragEnd={(noteId) => {
              if (!noteDropHandledRef.current) {
                assignFolder(noteId, null);
              }
              setDraggedNoteId(null);
              setDragOverFolder(null);
            }}
            onEdit={async () => {
              await switchDraft(note.id);
              openBuilder();
            }}
                onExport={() => {
                  void exportNote(note.id, note.title);
                }}
                exporting={exportingId === note.id}
                onSaveTags={(tags) => {
                  void saveNoteTags(note.id, tags);
                }}
                tagsSaving={!!tagSavingById[note.id]}
              />
            ))}
        {notesByFolder.unfiled.length === 0 ? (
          <div className="rounded-md border border-dashed surface-card-soft px-3 py-2 text-xs text-foreground/60">
            Drag notes or folders here to move them to root.
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        {rootFolders.map((folder) => renderFolderNode(folder, 0))}
      </div>

      {isFolderModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-md rounded-lg border surface-card-strong p-4 space-y-3">
            <h2 className="text-lg font-semibold">New folder</h2>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full rounded-md border surface-card-soft bg-transparent px-3 py-2 text-sm"
            />
            <label className="block space-y-1">
              <span className="text-xs text-foreground/70">Parent folder (optional)</span>
              <select
                value={newFolderParent}
                onChange={(e) => setNewFolderParent(e.target.value)}
                className="w-full rounded-md border surface-card-soft bg-transparent px-3 py-2 text-sm"
              >
                <option value="">Root level</option>
                {folderOptions.map((option) => (
                  <option key={option.name} value={option.name}>
                    {`${"  ".repeat(option.depth)}${option.name}`}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsFolderModalOpen(false)}
                className="rounded-md border surface-button px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const created = upsertFolder(newFolderName, newFolderParent || null);
                  if (created) setIsFolderModalOpen(false);
                }}
                className="rounded-md bg-foreground text-background px-3 py-2 text-sm"
              >
                Create folder
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renamingFolder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-md rounded-lg border surface-card-strong p-4 space-y-3">
            <h2 className="text-lg font-semibold">Rename folder</h2>
            <input
              autoFocus
              value={renameFolderName}
              onChange={(e) => setRenameFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full rounded-md border surface-card-soft bg-transparent px-3 py-2 text-sm"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRenamingFolder(null)}
                className="rounded-md border surface-button px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const renamed = renameFolder(renamingFolder, renameFolderName);
                  if (renamed) setRenamingFolder(null);
                }}
                className="rounded-md bg-foreground text-background px-3 py-2 text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showTipsTooltip ? (
        <div className="fixed bottom-20 right-4 z-40 w-[280px] rounded-lg border surface-card-strong p-3 shadow-lg backdrop-blur">
          <p className="text-xs text-foreground/80">
            Need help with nested folders, drag-and-drop, exports, or sharing?
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Link href="/help" className="text-xs underline">
              Open help
            </Link>
            <button
              onClick={onDismissTips}
              className="rounded-md border surface-button px-2 py-1 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="fixed right-4 bottom-4 z-40">
        <div className="relative">
          {isMenuOpen ? (
            <div className="absolute right-0 bottom-12 z-20 w-44 rounded-md border surface-card-strong shadow-lg p-1.5 space-y-1">
              <button
                onClick={() => {
                  void onCreateNewNote();
                }}
                className="w-full rounded-md border surface-button px-3 py-2 text-left text-sm"
              >
                New note
              </button>
              <button
                onClick={onOpenNewFolderModal}
                className="w-full rounded-md border surface-button px-3 py-2 text-left text-sm"
              >
                New folder
              </button>
            </div>
          ) : null}
          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background text-2xl shadow-lg hover:opacity-90"
            aria-label="Create"
            title="Create"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteRow({
  note,
  isDragging,
  onDragStart,
  onDragEnd,
  onEdit,
  onExport,
  exporting,
  onSaveTags,
  tagsSaving,
}: {
  note: InsightDraftSummary;
  isDragging: boolean;
  onDragStart: (noteId: string, event: DragEvent<HTMLElement>) => void;
  onDragEnd: (noteId: string) => void;
  onEdit: () => Promise<void>;
  onExport: () => void;
  exporting: boolean;
  onSaveTags: (tags: string[]) => void;
  tagsSaving: boolean;
}) {
  const [tagInput, setTagInput] = useState("");
  const [localTags, setLocalTags] = useState<string[]>(note.tags ?? []);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);

  useEffect(() => {
    setLocalTags(note.tags ?? []);
    setTagInput("");
    setIsTagEditorOpen(false);
  }, [note.id, note.tags]);

  function addTag() {
    const nextTag = tagInput.trim().replace(/^#+/, "").toLowerCase();
    if (!nextTag) return;
    if (localTags.includes(nextTag)) {
      setTagInput("");
      return;
    }
    const next = [...localTags, nextTag].slice(0, 20);
    setLocalTags(next);
    setTagInput("");
    onSaveTags(next);
    setIsTagEditorOpen(false);
  }

  function removeTag(tagToRemove: string) {
    const next = localTags.filter((tag) => tag !== tagToRemove);
    setLocalTags(next);
    onSaveTags(next);
  }

  return (
    <article
      draggable
      onDragStart={(e) => onDragStart(note.id, e)}
      onDragEnd={() => onDragEnd(note.id)}
      className={`rounded-md border surface-card p-3 ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium truncate">{note.title}</h3>
          <p className="text-xs text-foreground/65">
            {visibilityLabel(note.visibility)} - Updated {new Date(note.updated_at).toLocaleDateString()}
          </p>
        </div>
        <div className="relative flex items-center gap-1.5">
          {localTags.length > 0 ? (
            <div className="max-w-[260px] overflow-x-auto">
              <div className="flex items-center gap-1">
                {localTags.map((tag) => (
                  <button
                    key={`${note.id}-${tag}`}
                    onClick={() => removeTag(tag)}
                    disabled={note.status !== "draft" || tagsSaving}
                    className="group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-foreground disabled:opacity-60"
                    style={getTagChipStyle(tag)}
                    title={note.status === "draft" ? "Remove tag" : "Tag editing only available for drafts"}
                  >
                    <span>{tag}</span>
                    {note.status === "draft" ? (
                      <span className="opacity-0 transition-opacity group-hover:opacity-100">x</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {note.status === "draft" ? (
            <button
              onClick={() => setIsTagEditorOpen((prev) => !prev)}
              disabled={tagsSaving}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border surface-button text-sm disabled:opacity-60"
              title="Add tag"
              aria-label="Add tag"
            >
              +
            </button>
          ) : null}
          <span className="cursor-grab text-foreground/50" aria-hidden>
            ::
          </span>
          {isTagEditorOpen ? (
            <div className="absolute right-8 top-7 z-10 w-44 rounded-md border surface-card-strong shadow-lg p-2 space-y-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Tag name"
                className="w-full rounded-md border surface-card-soft bg-transparent px-2 py-1 text-xs"
              />
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => setIsTagEditorOpen(false)}
                  className="rounded-md border surface-button px-2 py-1 text-xs"
                >
                  Close
                </button>
                <button
                  onClick={addTag}
                  disabled={tagsSaving}
                  className="rounded-md border surface-button px-2 py-1 text-xs disabled:opacity-60"
                >
                  {tagsSaving ? "..." : "Add"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link href={`/insights/shared/${note.id}`} className="rounded-md border surface-button px-2.5 py-1.5 text-xs">
          View
        </Link>
        {note.status === "draft" ? (
          <button onClick={() => void onEdit()} className="rounded-md border surface-button px-2.5 py-1.5 text-xs">
            Edit
          </button>
        ) : null}
        <button
          onClick={onExport}
          disabled={exporting}
          className="rounded-md border surface-button px-2.5 py-1.5 text-xs disabled:opacity-60"
        >
          {exporting ? "Exporting..." : "Export"}
        </button>
      </div>
    </article>
  );
}
