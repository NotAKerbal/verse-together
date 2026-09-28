"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCheck,
  faChevronDown,
  faEllipsis,
  faFolder,
  faLightbulb,
  faMagnifyingGlass,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import type { InsightDraftSummary, InsightVisibility } from "@/lib/appData";
import { buildFolderPath, groupNotesByFolder, type FolderParentMap } from "@/lib/noteFolders";
import { useInsightBuilder } from "./InsightBuilderProvider";

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export const VISIBILITY_OPTIONS: Array<{ key: InsightVisibility; label: string; description: string }> = [
  { key: "private", label: "Only me", description: "Nobody else can open this note." },
  { key: "friends", label: "Friends", description: "People you have added as friends can open it." },
  { key: "link", label: "Anyone with the link", description: "Anyone who has the link can read it." },
  { key: "public", label: "Public", description: "Listed in the public notes stream." },
];

export function visibilityLabel(visibility: InsightVisibility): string {
  return VISIBILITY_OPTIONS.find((option) => option.key === visibility)?.label ?? "Only me";
}

export type NoteStatusTone = "muted" | "mint" | "sky" | "skySoft" | "yellow";

/** The one-word status a note card and the panel show: Draft, Published, Friends, Link, Public. */
export function noteStatus(note: Pick<InsightDraftSummary, "status" | "visibility">): {
  label: string;
  tone: NoteStatusTone;
} {
  if (note.status === "published") return { label: "Published", tone: "mint" };
  if (note.visibility === "friends") return { label: "Friends", tone: "sky" };
  if (note.visibility === "link") return { label: "Link", tone: "skySoft" };
  if (note.visibility === "public") return { label: "Public", tone: "yellow" };
  return { label: "Draft", tone: "muted" };
}

const TONE_BACKGROUND: Record<NoteStatusTone, string> = {
  muted: "var(--surface-card-soft)",
  mint: "var(--accent-mint)",
  sky: "var(--accent-sky)",
  skySoft: "var(--accent-sky-soft)",
  yellow: "var(--accent-primary)",
};

export function StatusPill({
  note,
  className = "",
}: {
  note: Pick<InsightDraftSummary, "status" | "visibility">;
  className?: string;
}) {
  const { label, tone } = noteStatus(note);
  return (
    <span
      className={`pill-tag shrink-0 px-2 py-0.5 text-[0.62rem] ${tone === "yellow" ? "text-[#17161a]" : ""} ${className}`}
      style={{ background: TONE_BACKGROUND[tone] }}
    >
      {label}
    </span>
  );
}

export function shareUrlFor(draftId: string): string {
  const path = `/insights/shared/${draftId}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

/** True under Tailwind's lg breakpoint, where the note surfaces switch to their phone layouts. */
export function useIsPhoneLayout(): boolean {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsPhone(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return isPhone;
}

// ---------------------------------------------------------------------------
// Shared bits of chrome
// ---------------------------------------------------------------------------

export function LightbulbBadge({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-6 w-6" : "h-9 w-9";
  const icon = size === "lg" ? "h-4.5 w-4.5" : size === "sm" ? "h-3 w-3" : "h-4 w-4";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--accent-primary)] text-[#17161a] ${className}`}
    >
      <FontAwesomeIcon icon={faLightbulb} className={icon} />
    </span>
  );
}

export const ICON_BUTTON_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] text-foreground hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50";

export const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2.5 rounded-[0.7rem] px-3 py-2 text-left text-sm font-semibold text-foreground hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:bg-[color:var(--surface-button-hover)] disabled:opacity-50 disabled:hover:bg-transparent";

// ---------------------------------------------------------------------------
// Popover: one anchored Marker card used by every menu here. The parent must
// be `relative`. Handles outside click, Escape, arrow keys and focus return.
// ---------------------------------------------------------------------------

export function Popover({
  open,
  onClose,
  triggerRef,
  role = "menu",
  label,
  align = "left",
  placement = "below",
  className = "",
  autoFocus = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  role?: "menu" | "listbox" | "dialog";
  label: string;
  /** "none" leaves horizontal placement to `className`. */
  align?: "left" | "right" | "stretch" | "none";
  placement?: "below" | "above";
  className?: string;
  autoFocus?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (ref.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onClose, triggerRef]);

  useEffect(() => {
    if (!open || !autoFocus) return;
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus], [data-menu-item]");
    first?.focus();
  }, [open, autoFocus]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-menu-item]:not([disabled])") ?? []);
    if (items.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const inField = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    const index = active ? items.indexOf(active) : -1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length].focus();
    } else if (event.key === "Home" && !inField) {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === "End" && !inField) {
      event.preventDefault();
      items[items.length - 1].focus();
    }
  }

  if (!open) return null;
  const alignClass = align === "right" ? "right-0" : align === "stretch" ? "left-0 right-0" : align === "none" ? "" : "left-0";
  const placementClass = placement === "above" ? "bottom-[calc(100%+0.45rem)]" : "top-[calc(100%+0.45rem)]";
  return (
    <div
      ref={ref}
      role={role}
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={`panel-card-strong absolute z-50 rounded-[1rem] p-1.5 font-sans text-foreground ${alignClass} ${placementClass} ${className}`}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  onSelect,
  icon,
  children,
  danger = false,
  disabled = false,
  role = "menuitem",
  checked,
}: {
  onSelect: () => void;
  icon?: ReactNode;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  role?: "menuitem" | "menuitemradio" | "option";
  checked?: boolean;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "menuitemradio" ? checked : undefined}
      aria-selected={role === "option" ? checked : undefined}
      data-menu-item
      disabled={disabled}
      onClick={onSelect}
      className={`${MENU_ITEM_CLASS} ${danger ? "text-[color:var(--accent-coral)]" : ""}`}
      style={danger ? { color: "color-mix(in srgb, var(--accent-coral) 70%, var(--foreground))" } : undefined}
    >
      {icon ? <span className="inline-flex w-4 shrink-0 justify-center">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {checked ? <FontAwesomeIcon icon={faCheck} className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Note switcher: title + subline trigger, dropdown with search, "+ New note"
// and the user's notes grouped by folder.
// ---------------------------------------------------------------------------

export function noteSubline({
  folderPath,
  status,
  blockCount,
}: {
  folderPath: string;
  status: InsightDraftSummary["status"];
  blockCount: number | undefined;
}): string {
  const parts = [folderPath || "Unfiled", status === "published" ? "Published" : "Draft"];
  if (typeof blockCount === "number") parts.push(blockCount === 1 ? "1 block" : `${blockCount} blocks`);
  return parts.join(" · ");
}

export function NoteSwitcher({
  notes,
  activeNote,
  activeBlockCount,
  noteFolderMap,
  folderParentMap,
  onSelect,
  onCreate,
  busy = false,
}: {
  notes: InsightDraftSummary[];
  activeNote: InsightDraftSummary | null;
  activeBlockCount?: number;
  noteFolderMap: Record<string, string>;
  folderParentMap: FolderParentMap;
  onSelect: (draftId: string) => void;
  onCreate: () => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) => {
      const folder = (noteFolderMap[note.id] ?? "").toLowerCase();
      return (
        note.title.toLowerCase().includes(q) ||
        folder.includes(q) ||
        (note.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [notes, query, noteFolderMap]);

  const groups = useMemo(() => groupNotesByFolder(filtered, noteFolderMap, folderParentMap), [
    filtered,
    noteFolderMap,
    folderParentMap,
  ]);

  const activeFolderPath = useMemo(
    () => (activeNote ? buildFolderPath(noteFolderMap[activeNote.id] ?? "", folderParentMap) : ""),
    [activeNote, noteFolderMap, folderParentMap]
  );

  function renderOption(note: InsightDraftSummary) {
    const isActive = note.id === activeNote?.id;
    return (
      <MenuItem
        key={note.id}
        role="option"
        checked={isActive}
        onSelect={() => {
          close();
          onSelect(note.id);
        }}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{note.title || "Untitled note"}</span>
          <StatusPill note={note} />
        </span>
      </MenuItem>
    );
  }

  return (
    <div className="relative min-w-0 flex-1">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={activeNote ? `Switch note. Current note: ${activeNote.title}` : "Choose a note"}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full min-w-0 items-center gap-2 rounded-[0.8rem] px-2 py-1 text-left hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[1.02rem] font-extrabold leading-tight tracking-[-0.02em] text-foreground">
            {activeNote ? activeNote.title || "Untitled note" : "Notebook"}
          </span>
          <span className="block truncate text-[0.72rem] font-semibold text-foreground/65">
            {activeNote
              ? noteSubline({ folderPath: activeFolderPath, status: activeNote.status, blockCount: activeBlockCount })
              : notes.length === 0
              ? "No notes yet"
              : "Choose a note"}
          </span>
        </span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`h-3 w-3 shrink-0 text-foreground/70 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      <Popover
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        role="listbox"
        label="Your notes"
        align="none"
        className="left-[-2.75rem] max-h-[min(60vh,28rem)] w-[calc(100%+8.5rem)] max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 bg-[color:var(--surface-card-strong)] pb-1.5">
          <label className="soft-input flex items-center gap-2 rounded-full px-3 py-1.5">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="h-3 w-3 text-foreground/55" aria-hidden="true" />
            <input
              data-autofocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes"
              aria-label="Search notes"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/50"
            />
          </label>
        </div>
        <MenuItem
          role="option"
          disabled={busy}
          icon={<FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />}
          onSelect={() => {
            close();
            onCreate();
          }}
        >
          New note
        </MenuItem>
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-foreground/60">{notes.length === 0 ? "No notes yet." : "No notes match."}</p>
        ) : null}
        {groups.rootNotes.length > 0 ? (
          <div className="mt-1">
            {groups.folderGroups.length > 0 ? <GroupLabel>Unfiled</GroupLabel> : null}
            {groups.rootNotes.map(renderOption)}
          </div>
        ) : null}
        {groups.folderGroups.map((group) => (
          <div key={group.folderLabel} className="mt-1">
            <GroupLabel>
              <FontAwesomeIcon icon={faFolder} className="mr-1.5 h-3 w-3" aria-hidden="true" />
              {group.folderLabel}
            </GroupLabel>
            {group.items.map(renderOption)}
          </div>
        ))}
      </Popover>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[0.66rem] font-bold uppercase tracking-[0.08em] text-foreground/55">{children}</div>
  );
}

// ---------------------------------------------------------------------------
// "..." options menu: Rename, Move to folder, Visibility, Delete (+ extras).
// ---------------------------------------------------------------------------

export function NoteOptionsMenu({
  note,
  currentFolder,
  folderTree,
  onRename,
  onMoveToFolder,
  onVisibility,
  onDelete,
  extraItems,
  align = "right",
}: {
  note: InsightDraftSummary | null;
  currentFolder: string;
  folderTree: Array<{ name: string; depth: number; path: string }>;
  onRename: () => void;
  onMoveToFolder: (folderName: string | null) => void;
  onVisibility: () => void;
  onDelete: () => void;
  extraItems?: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "folders">("main");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => {
    setOpen(false);
    setView("main");
  }, []);
  const editable = note?.status === "draft";

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Note options"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!note}
        onClick={() => (open ? close() : setOpen(true))}
        className={ICON_BUTTON_CLASS}
      >
        <FontAwesomeIcon icon={faEllipsis} className="h-4 w-4" aria-hidden="true" />
      </button>
      <Popover open={open} onClose={close} triggerRef={triggerRef} label="Note options" align={align} className="w-60">
        {view === "main" ? (
          <>
            <MenuItem
              disabled={!editable}
              onSelect={() => {
                close();
                onRename();
              }}
            >
              Rename
            </MenuItem>
            <MenuItem onSelect={() => setView("folders")}>Move to folder…</MenuItem>
            <MenuItem
              disabled={!editable}
              onSelect={() => {
                close();
                onVisibility();
              }}
            >
              Visibility…
            </MenuItem>
            {extraItems ? (
              <div className="my-1 border-t-2 border-[color:var(--surface-border)] pt-1" onClick={close}>
                {extraItems}
              </div>
            ) : null}
            <div className="my-1 border-t-2 border-[color:var(--surface-border)]" />
            <MenuItem
              danger
              disabled={!editable}
              onSelect={() => {
                close();
                onDelete();
              }}
            >
              Delete note
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem
              icon={<FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" aria-hidden="true" />}
              onSelect={() => setView("main")}
            >
              Move to folder
            </MenuItem>
            <div className="my-1 border-t-2 border-[color:var(--surface-border)]" />
            <MenuItem
              role="menuitemradio"
              checked={!currentFolder}
              onSelect={() => {
                close();
                onMoveToFolder(null);
              }}
            >
              Unfiled
            </MenuItem>
            {folderTree.length === 0 ? (
              <p className="px-3 py-2 text-xs text-foreground/60">No folders yet. Make one on the Notes page.</p>
            ) : null}
            {folderTree.map((folder) => (
              <MenuItem
                key={folder.name}
                role="menuitemradio"
                checked={currentFolder === folder.name}
                icon={<FontAwesomeIcon icon={faFolder} className="h-3 w-3" aria-hidden="true" />}
                onSelect={() => {
                  close();
                  onMoveToFolder(folder.name);
                }}
              >
                <span style={{ paddingLeft: `${folder.depth * 0.75}rem` }}>{folder.name}</span>
              </MenuItem>
            ))}
          </>
        )}
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Share sheet: who can view, the link with a copy button, and Publish.
// ---------------------------------------------------------------------------

export function ShareButton({
  note,
  placement = "below",
  align = "right",
  variant = "black",
  openSignal = 0,
  className = "",
}: {
  note: InsightDraftSummary | null;
  placement?: "below" | "above";
  align?: "left" | "right";
  variant?: "black" | "outline";
  /** Bump to open the sheet from elsewhere (the "Visibility…" menu item). */
  openSignal?: number;
  className?: string;
}) {
  const { saveDraftSettings, activeDraft } = useInsightBuilder();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const editable = note?.status === "draft";
  const blockCount = activeDraft && note && activeDraft.id === note.id ? activeDraft.blocks.length : note?.block_count ?? 0;

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    if (!open) setMessage("");
  }, [open]);

  async function choose(visibility: InsightVisibility) {
    if (!note || !editable || busy) return;
    setBusy(true);
    try {
      await saveDraftSettings({ draftId: note.id, visibility });
      setMessage("Sharing updated");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!note) return;
    try {
      await navigator.clipboard.writeText(shareUrlFor(note.id));
      setMessage("Link copied");
    } catch {
      setMessage("Could not copy; select the link instead");
    }
  }

  const triggerClass =
    variant === "black"
      ? "inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-3.5 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50"
      : "surface-button inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50";

  return (
    <div className={`relative shrink-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!note}
        onClick={() => setOpen((prev) => !prev)}
        className={triggerClass}
      >
        Share…
      </button>
      <Popover
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        role="dialog"
        label="Share this note"
        align={align}
        placement={placement}
        className="w-[min(20rem,calc(100vw-2rem))] p-3"
      >
        {note ? (
          <div className="space-y-3">
            <div>
              <div className="font-display text-sm font-extrabold tracking-[-0.02em]">Who can view this note?</div>
              {!editable ? (
                <p className="mt-0.5 text-xs text-foreground/60">Published notes keep the visibility they were published with.</p>
              ) : null}
            </div>
            <div role="radiogroup" aria-label="Who can view this note" className="space-y-1">
              {VISIBILITY_OPTIONS.map((option) => {
                const selected = note.visibility === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-menu-item
                    disabled={!editable || busy}
                    onClick={() => void choose(option.key)}
                    className={`flex w-full items-start gap-2.5 rounded-[0.8rem] border-2 px-3 py-2 text-left disabled:opacity-60 ${
                      selected
                        ? "border-[color:var(--surface-border)] bg-[color:var(--accent-note)]"
                        : "border-transparent hover:bg-[color:var(--surface-button-hover)]"
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] ${
                        selected ? "bg-[color:var(--surface-button-active)]" : "bg-[color:var(--surface-card)]"
                      }`}
                    >
                      {selected ? <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--surface-button-active-text)]" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{option.label}</span>
                      <span className="block text-xs text-foreground/65">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-[0.8rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] px-3 py-2">
              <div className="text-[0.66rem] font-bold uppercase tracking-[0.08em] text-foreground/55">Sharable link</div>
              <div className="mt-1 flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrlFor(note.id)}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="Sharable link"
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground/85 outline-none"
                />
                <button
                  type="button"
                  data-menu-item
                  onClick={() => void copyLink()}
                  className="surface-button shrink-0 rounded-full border-2 px-2.5 py-1 text-xs"
                >
                  Copy
                </button>
              </div>
              {note.visibility === "private" ? (
                <p className="mt-1 text-[0.7rem] text-foreground/60">Right now only you can open it.</p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-foreground/65" aria-live="polite">
                {message}
              </span>
              {editable ? (
                <Link
                  href={`/insights/publish/${note.id}`}
                  data-menu-item
                  aria-disabled={blockCount === 0}
                  onClick={(event) => {
                    if (blockCount === 0) event.preventDefault();
                  }}
                  className={`inline-flex h-9 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-3.5 text-sm font-bold text-[color:var(--surface-button-active-text)] ${
                    blockCount === 0 ? "cursor-not-allowed opacity-50" : "hover:opacity-90"
                  }`}
                  title={blockCount === 0 ? "Add a block before publishing" : "Publish a fixed copy of this note"}
                >
                  Publish…
                </Link>
              ) : (
                <Link href={shareUrlFor(note.id)} data-menu-item className="surface-button inline-flex h-9 items-center rounded-full border-2 px-3.5 text-sm">
                  View note
                </Link>
              )}
            </div>
          </div>
        ) : null}
      </Popover>
    </div>
  );
}
