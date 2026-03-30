"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import InsightEditorPanel from "./InsightEditorPanel";
import { useInsightBuilder } from "./InsightBuilderProvider";

const OPEN_DRAFTS_STORAGE_PREFIX = "vt_reader_open_drafts_v1";
const NOTE_FOLDER_MAP_KEY = "vt_note_folder_map_v1";
const FOLDER_PARENT_MAP_KEY = "vt_folder_parent_map_v1";

type FolderParentMap = Record<string, string>;
type DraftListItem = { id: string; title: string };

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

function groupDraftsByFolder<TDraft extends DraftListItem>(
  draftList: TDraft[],
  noteFolderMap: Record<string, string>,
  folderParentMap: FolderParentMap
): { rootDrafts: TDraft[]; folderGroups: Array<{ folderLabel: string; draftList: TDraft[] }> } {
  const rootDrafts: TDraft[] = [];
  const buckets = new Map<string, TDraft[]>();
  draftList.forEach((draft) => {
    const folder = noteFolderMap[draft.id] ?? "";
    const folderPath = buildFolderPath(folder, folderParentMap);
    if (!folderPath) {
      rootDrafts.push(draft);
      return;
    }
    const current = buckets.get(folderPath) ?? [];
    current.push(draft);
    buckets.set(folderPath, current);
  });
  rootDrafts.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  for (const [key, items] of buckets.entries()) {
    items.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    buckets.set(key, items);
  }
  const folderGroups = Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    .map(([folderLabel, groupedDrafts]) => ({ folderLabel, draftList: groupedDrafts }));
  return { rootDrafts, folderGroups };
}

function renderFolderLabel(folderLabel: string): string {
  return folderLabel.replaceAll(" / ", " > ");
}

function BuilderContent({ isMobile = false }: { isMobile?: boolean }) {
  const { user } = useAuth();
  const { drafts, activeDraftId, isLoading, createDraft, switchDraft, clearActiveDraft } = useInsightBuilder();
  const [openDraftIds, setOpenDraftIds] = useState<string[]>([]);
  const [isLoadSavedOpen, setIsLoadSavedOpen] = useState(false);
  const [noteFolderMap, setNoteFolderMap] = useState<Record<string, string>>({});
  const [folderParentMap, setFolderParentMap] = useState<FolderParentMap>({});
  const [busy, setBusy] = useState(false);
  const [hasRestoredOpenDrafts, setHasRestoredOpenDrafts] = useState(false);
  const openDraftStorageKey = useMemo(
    () => (user?.id ? `${OPEN_DRAFTS_STORAGE_PREFIX}:${user.id}` : null),
    [user?.id]
  );
  const draftNotes = useMemo(() => drafts.filter((draft) => draft.status === "draft"), [drafts]);

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
    setHasRestoredOpenDrafts(false);
    setOpenDraftIds([]);
  }, [openDraftStorageKey]);

  useEffect(() => {
    if (isLoading) return;
    const draftIds = draftNotes.map((draft) => draft.id);
    const draftIdSet = new Set(draftIds);

    if (!hasRestoredOpenDrafts) {
      const restored = readStoredDraftIds(openDraftStorageKey).filter((id) => draftIdSet.has(id));
      if (activeDraftId && draftIdSet.has(activeDraftId) && !restored.includes(activeDraftId)) {
        restored.push(activeDraftId);
      }
      setOpenDraftIds(restored);
      setHasRestoredOpenDrafts(true);
      return;
    }

    setOpenDraftIds((prev) => {
      const kept = prev.filter((id) => draftIdSet.has(id));
      if (activeDraftId && draftIdSet.has(activeDraftId) && !kept.includes(activeDraftId)) {
        return [...kept, activeDraftId];
      }
      return kept;
    });
  }, [isLoading, draftNotes, activeDraftId, openDraftStorageKey, hasRestoredOpenDrafts]);

  useEffect(() => {
    if (!openDraftStorageKey || !hasRestoredOpenDrafts || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(openDraftStorageKey, JSON.stringify(openDraftIds));
    } catch {
      // ignore storage errors
    }
  }, [openDraftIds, openDraftStorageKey, hasRestoredOpenDrafts]);

  const hasDraftNotes = draftNotes.length > 0;
  const openDraftTabs = useMemo(() => {
    const byId = new Map(draftNotes.map((draft) => [draft.id, draft]));
    return openDraftIds
      .map((id) => byId.get(id))
      .filter((draft): draft is (typeof drafts)[number] => Boolean(draft));
  }, [draftNotes, openDraftIds, drafts]);
  const hiddenDraftTabs = useMemo(() => {
    const openSet = new Set(openDraftIds);
    return draftNotes.filter((draft) => !openSet.has(draft.id));
  }, [draftNotes, openDraftIds]);
  const allDraftGroups = useMemo(
    () => groupDraftsByFolder(draftNotes, noteFolderMap, folderParentMap),
    [draftNotes, noteFolderMap, folderParentMap]
  );
  const hiddenDraftGroups = useMemo(
    () => groupDraftsByFolder(hiddenDraftTabs, noteFolderMap, folderParentMap),
    [hiddenDraftTabs, noteFolderMap, folderParentMap]
  );
  const showMobileFullList = isMobile && !isLoading && !activeDraftId && hasDraftNotes;

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

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3 pb-0">
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
              onClick={() => void onCreateDraft()}
              disabled={busy}
              className="rounded-md border surface-button px-2 py-1 text-xs"
            >
              + Note
            </button>
          </div>
        </div>
        {isLoadSavedOpen && !showMobileFullList ? (
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border surface-card p-2">
            {hiddenDraftTabs.length === 0 ? (
              <p className="px-1 py-1 text-xs text-foreground/60">No notes available to load.</p>
            ) : (
              <>
                {hiddenDraftGroups.rootDrafts.length > 0 ? (
                  <div className="space-y-1">
                    {hiddenDraftGroups.rootDrafts.map((draft) => (
                      <button
                        key={draft.id}
                        onClick={() => void onLoadSaved(draft.id)}
                        className="w-full rounded-md border surface-button px-2.5 py-2 text-left text-sm"
                      >
                        {draft.title}
                      </button>
                    ))}
                  </div>
                ) : null}
                {hiddenDraftGroups.folderGroups.map((group) => (
                  <section key={group.folderLabel} className="space-y-1 rounded-md border surface-card-soft p-2">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <p className="truncate pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
                        {renderFolderLabel(group.folderLabel)}
                      </p>
                      <span className="shrink-0 rounded-full border surface-button px-1.5 py-0.5 text-[10px] text-foreground/60">
                        {group.draftList.length}
                      </span>
                    </div>
                    {group.draftList.map((draft) => (
                      <button
                        key={draft.id}
                        onClick={() => void onLoadSaved(draft.id)}
                        className="w-full rounded-md border surface-button px-2.5 py-2 text-left text-sm"
                      >
                        {draft.title}
                      </button>
                    ))}
                  </section>
                ))}
              </>
            )}
          </div>
        ) : null}
        {!showMobileFullList ? (
          <div className="no-scrollbar flex items-end gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--surface-border)] pb-0">
            {openDraftTabs.map((draft) => (
              <div
                key={draft.id}
                className={`relative top-px flex items-center gap-1 whitespace-nowrap rounded-t-md border border-b-0 px-2 py-1.5 text-xs ${
                  draft.id === activeDraftId ? "surface-card text-foreground" : "surface-card-soft text-foreground/75"
                }`}
              >
                <button onClick={() => void switchDraft(draft.id)} className="px-1 text-left">
                  {draft.title}
                </button>
                <button
                  onClick={() => void onCloseTab(draft.id)}
                  className="inline-flex h-4 w-4 items-center justify-center rounded border surface-button"
                  title="Close tab"
                  aria-label={`Close ${draft.title}`}
                >
                  x
                </button>
              </div>
            ))}
            {openDraftTabs.length === 0 ? (
              hasDraftNotes ? (
                <button
                  onClick={() => setIsLoadSavedOpen(true)}
                  className="px-1 py-1 text-xs text-foreground/70 underline underline-offset-2"
                >
                  Load notes to select one.
                </button>
              ) : (
                <span className="px-1 py-1 text-xs text-foreground/60">No saved notes yet.</span>
              )
            ) : null}
          </div>
        ) : null}
      </div>

      {showMobileFullList ? (
        <div className="flex-1 space-y-2 overflow-y-auto p-3 pt-1 pb-3">
          <p className="px-1 text-xs text-foreground/65">Select a note to open it.</p>
          {allDraftGroups.rootDrafts.length > 0 ? (
            <div className="space-y-1.5">
              {allDraftGroups.rootDrafts.map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => void onLoadSaved(draft.id)}
                  className="w-full rounded-md border surface-button px-3 py-2.5 text-left text-sm"
                >
                  {draft.title}
                </button>
              ))}
            </div>
          ) : null}
          {allDraftGroups.folderGroups.map((group) => (
            <section key={group.folderLabel} className="space-y-2 rounded-lg border surface-card p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                  {renderFolderLabel(group.folderLabel)}
                </p>
                <span className="shrink-0 rounded-full border surface-button px-2 py-0.5 text-[11px] text-foreground/65">
                  {group.draftList.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {group.draftList.map((draft) => (
                  <button
                    key={draft.id}
                    onClick={() => void onLoadSaved(draft.id)}
                    className="w-full rounded-md border surface-button px-3 py-2.5 text-left text-sm"
                  >
                    {draft.title}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 pt-0">
          <InsightEditorPanel variant="floating" />
        </div>
      )}
    </div>
  );
}

export default function InsightBuilderShell() {
  const pathname = usePathname();
  const { canUseInsights, isMobileOpen, closeBuilder, activeDraftId } = useInsightBuilder();
  const hideShell = pathname === "/notes" || pathname.startsWith("/notes/");

  if (!canUseInsights || hideShell) return null;

  return (
    <>
      {isMobileOpen ? (
        <div className="fixed inset-0 z-50 bg-background lg:hidden">
          <div className="h-full overflow-hidden">
            <BuilderContent isMobile={true} />
          </div>
          <button
            onClick={closeBuilder}
            className="fixed right-[calc(env(safe-area-inset-right)+0.5rem)] bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-[60] rounded-full border surface-button px-4 py-2 text-xs font-medium shadow-lg backdrop-blur"
          >
            Close
          </button>
        </div>
      ) : null}

      {activeDraftId ? (
        <aside className="fixed right-0 top-16 bottom-0 z-40 hidden w-[360px] border-l border-[var(--surface-border)] bg-[var(--surface-card-strong)] backdrop-blur lg:block xl:w-[420px] 2xl:w-[480px]">
          <BuilderContent />
        </aside>
      ) : null}
    </>
  );
}
