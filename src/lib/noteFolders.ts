import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** Shape returned by `api.noteFolders.getWorkspace`. */
export type NoteFolderWorkspace = FunctionReturnType<typeof api.noteFolders.getWorkspace>;

/** child folder name -> parent folder name */
export type FolderParentMap = Record<string, string>;

export type NoteFolderMaps = {
  /** Every folder name, sorted. */
  folderNames: string[];
  folderParentMap: FolderParentMap;
  /** draft id -> folder name */
  noteFolderMap: Record<string, string>;
  folderIdByName: Map<string, Id<"noteFolders">>;
};

const EMPTY_MAPS: NoteFolderMaps = {
  folderNames: [],
  folderParentMap: {},
  noteFolderMap: {},
  folderIdByName: new Map(),
};

/**
 * Turns the cloud workspace into the name-keyed maps the UI has always worked
 * with, so the folder tree and reader side panel render exactly as before.
 */
export function deriveNoteFolderMaps(workspace: NoteFolderWorkspace | undefined): NoteFolderMaps {
  if (!workspace) return EMPTY_MAPS;
  const nameById = new Map<string, string>();
  const folderIdByName = new Map<string, Id<"noteFolders">>();
  workspace.folders.forEach((folder) => {
    nameById.set(folder.id, folder.name);
    folderIdByName.set(folder.name, folder.id);
  });

  const folderParentMap: FolderParentMap = {};
  workspace.folders.forEach((folder) => {
    const parentName = folder.parent_folder_id ? nameById.get(folder.parent_folder_id) : undefined;
    if (parentName && parentName !== folder.name) folderParentMap[folder.name] = parentName;
  });

  const noteFolderMap: Record<string, string> = {};
  workspace.assignments.forEach((row) => {
    const folderName = nameById.get(row.folder_id);
    if (folderName) noteFolderMap[row.draft_id] = folderName;
  });

  const folderNames = workspace.folders.map((folder) => folder.name).sort((a, b) => a.localeCompare(b));
  return { folderNames, folderParentMap, noteFolderMap, folderIdByName };
}

/** "Parent / Child / Grandchild" for a folder name, guarding against cycles. */
export function buildFolderPath(folder: string, parentMap: FolderParentMap): string {
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

// ---------------------------------------------------------------------------
// Optimistic updates, so drag and drop never waits for the round trip.
// ---------------------------------------------------------------------------

function updateWorkspace(
  localStore: OptimisticLocalStore,
  update: (current: NoteFolderWorkspace) => NoteFolderWorkspace
) {
  const current = localStore.getQuery(api.noteFolders.getWorkspace, {});
  if (!current) return;
  localStore.setQuery(api.noteFolders.getWorkspace, {}, update(current));
}

export function optimisticAssignDraftFolder(
  localStore: OptimisticLocalStore,
  args: { draftId: Id<"insightDrafts">; folderId?: Id<"noteFolders"> }
) {
  updateWorkspace(localStore, (current) => {
    const assignments = current.assignments.filter((row) => row.draft_id !== args.draftId);
    if (args.folderId) assignments.push({ draft_id: args.draftId, folder_id: args.folderId });
    return { ...current, assignments };
  });
}

export function optimisticMoveFolder(
  localStore: OptimisticLocalStore,
  args: { folderId: Id<"noteFolders">; parentFolderId?: Id<"noteFolders"> }
) {
  updateWorkspace(localStore, (current) => ({
    ...current,
    folders: current.folders.map((folder) =>
      folder.id === args.folderId ? { ...folder, parent_folder_id: args.parentFolderId ?? null } : folder
    ),
  }));
}

export function optimisticRenameFolder(
  localStore: OptimisticLocalStore,
  args: { folderId: Id<"noteFolders">; name: string }
) {
  const name = args.name.trim().replace(/\s+/g, " ");
  if (!name) return;
  updateWorkspace(localStore, (current) => ({
    ...current,
    folders: current.folders.map((folder) => (folder.id === args.folderId ? { ...folder, name } : folder)),
  }));
}

export function optimisticDeleteFolder(localStore: OptimisticLocalStore, args: { folderId: Id<"noteFolders"> }) {
  updateWorkspace(localStore, (current) => ({
    folders: current.folders
      .filter((folder) => folder.id !== args.folderId)
      .map((folder) => (folder.parent_folder_id === args.folderId ? { ...folder, parent_folder_id: null } : folder)),
    assignments: current.assignments.filter((row) => row.folder_id !== args.folderId),
  }));
}

// ---------------------------------------------------------------------------
// Legacy localStorage maps, read once for the one-time import into Convex.
// ---------------------------------------------------------------------------

const LEGACY_FOLDER_NAMES_KEY = "vt_note_folder_names_v1";
const LEGACY_NOTE_FOLDER_MAP_KEY = "vt_note_folder_map_v1";
const LEGACY_FOLDER_PARENT_MAP_KEY = "vt_folder_parent_map_v1";
const LEGACY_MIGRATION_FLAG_KEY = "vt_note_folder_cloud_migration_done_v1";
const LEGACY_KEYS = [
  LEGACY_FOLDER_NAMES_KEY,
  LEGACY_NOTE_FOLDER_MAP_KEY,
  LEGACY_FOLDER_PARENT_MAP_KEY,
  LEGACY_MIGRATION_FLAG_KEY,
];

export type LegacyLocalFolderData = {
  folderNames: string[];
  parentMap: FolderParentMap;
  noteFolderMap: Record<string, string>;
  hasData: boolean;
};

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function readStringMap(key: string): Record<string, string> {
  const parsed = readJson(key);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(parsed as Record<string, unknown>)) {
    const k = String(rawKey).trim();
    const value = String(rawValue ?? "").trim();
    if (!k || !value || k === value) continue;
    out[k] = value;
  }
  return out;
}

export function readLegacyLocalFolderData(): LegacyLocalFolderData {
  if (typeof window === "undefined") {
    return { folderNames: [], parentMap: {}, noteFolderMap: {}, hasData: false };
  }
  const namesRaw = readJson(LEGACY_FOLDER_NAMES_KEY);
  const folderNames = Array.isArray(namesRaw)
    ? namesRaw
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 200)
    : [];
  const parentMap = readStringMap(LEGACY_FOLDER_PARENT_MAP_KEY);
  const noteFolderMap = readStringMap(LEGACY_NOTE_FOLDER_MAP_KEY);
  const hasData =
    folderNames.length > 0 || Object.keys(parentMap).length > 0 || Object.keys(noteFolderMap).length > 0;
  return { folderNames, parentMap, noteFolderMap, hasData };
}

export function clearLegacyLocalFolderData() {
  if (typeof window === "undefined") return;
  try {
    LEGACY_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore storage errors
  }
}
