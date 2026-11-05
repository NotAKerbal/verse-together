"use client";

import { useEffect, useId, useRef, useState, useTransition, type MouseEvent, type ReactNode } from "react";
import TranslationCatalogPicker, { useTranslationCatalog } from "@/components/TranslationCatalogPicker";
import { BIBLE_TRANSLATION_OPTIONS, type BibleTranslationId } from "@/lib/bibleCanon";
import { FEATURED_BIBLES, translationLanguage, translationTitle } from "@/lib/translationCatalog";
import { JST_SOURCE_DOCS_URL } from "@/lib/jst";
import { useFaithTradition } from "@/lib/useFaithTradition";
import { useDefaultBible } from "@/lib/useDefaultBible";
import { useJstPreference } from "@/lib/jstPreference";
import { removeSavedComparison } from "@/lib/bibleComparisons";
import {
  readFavoriteTranslations, useFavoriteTranslations, writeFavoriteTranslations, type FavoriteTranslation,
} from "@/lib/translationFavorites";

type Props = {
  /** Chapter-only visibility. Omit in Settings, where the saved library is managed. */
  shown?: BibleTranslationId[];
  onShownChange?: (id: string, on: boolean) => void;
};
const NO_COMPARISONS: BibleTranslationId[] = [];
type View = "list" | "catalog" | "language";
type ListRow = FavoriteTranslation & { saved: boolean; shown: boolean };

const KNOWN_BIBLES: FavoriteTranslation[] = [
  ...FEATURED_BIBLES.map((item) => ({ id: item.id, label: item.label, language: "English", abbreviation: item.shortLabel })),
  ...BIBLE_TRANSLATION_OPTIONS.map((item) => ({ ...item, language: "English" })),
];
const TITLES: Record<View, string> = { list: "Your Bibles", catalog: "Add a Bible", language: "Choose a language" };
const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function TrashIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
    <path d="M4 6h12M8 6V4.5h4V6m-6 0 .7 9.5h6.6L14 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function DefaultButton({ label, isDefault, disabled, onChoose, className = "" }: {
  label: string;
  isDefault: boolean;
  disabled: boolean;
  onChoose: () => void;
  className?: string;
}) {
  return <button type="button" aria-pressed={isDefault} disabled={disabled} onClick={onChoose} aria-label={`Use ${label} as default`}
    className={`shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-50 ${isDefault ? "" : "underline underline-offset-2"} ${className}`}>
    {isDefault ? "Default" : "Make default"}
  </button>;
}

function RemoveButton({ label, focusId, disabled, onRemove }: {
  label: string;
  focusId?: string;
  disabled: boolean;
  onRemove: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return <button type="button" data-bible-id={focusId} onClick={onRemove} aria-label={`Remove ${label}`} title="Remove" disabled={disabled}
    className="shrink-0 rounded-lg p-2 text-foreground/50 hover:bg-[color:var(--surface-button-hover)] hover:text-foreground"><TrashIcon /></button>;
}

function CompactRow({ label, language, topAction, children }: {
  label: string;
  language?: string;
  topAction?: ReactNode;
  children: ReactNode;
}) {
  return <li className="px-3 py-1.5">
    <div className="flex min-h-8 items-center gap-2">
      <p className="min-w-0 flex-1 break-words text-sm font-medium" dir="auto">
        {label}
        {language && language !== "English" ? <span className="font-normal text-foreground/60"> · {language}</span> : null}
      </p>
      {topAction}
    </div>
    <div className="flex min-h-8 items-center justify-between gap-2">{children}</div>
  </li>;
}

function SaveButton({ label, onSave, className = "" }: { label: string; onSave: () => void; className?: string }) {
  return <button type="button" onClick={onSave} aria-label={`Save ${label}`}
    className={`shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium underline underline-offset-2 ${className}`}>Save</button>;
}

function BibleList({ rows, onShow, onRemove, onSave, onAdd, defaultBible, onDefault, savingDefault }: {
  defaultBible: string;
  onDefault: (id: string) => void;
  savingDefault: boolean;
  rows: ListRow[];
  onShow?: (row: ListRow) => void;
  onRemove: (row: ListRow, event: MouseEvent<HTMLButtonElement>) => void;
  onSave: (row: ListRow) => void;
  onAdd: () => void;
}) {
  const { showLdsContent } = useFaithTradition();
  const baseBibleLabel = showLdsContent ? "King James Bible (LDS edition)" : "King James Bible";
  const baseIsDefault = defaultBible === "lds";
  return <div data-bible-list className="space-y-3">
    <ul aria-label="Your Bibles" className="divide-y divide-[color:var(--surface-border)] rounded-xl border border-[color:var(--surface-border)]">
      {onShow ? <CompactRow label={baseBibleLabel}>
        <DefaultButton label={baseBibleLabel} isDefault={baseIsDefault} disabled={savingDefault} onChoose={() => onDefault("lds")} className="-ml-2" />
      </CompactRow> : <li className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">{baseBibleLabel}</p>
        <p className="mt-0.5 text-xs text-foreground/60">English · Available offline</p></div>
        <DefaultButton label={baseBibleLabel} isDefault={baseIsDefault} disabled={savingDefault} onChoose={() => onDefault("lds")} />
      </li>}
      {rows.map((row) => {
        const isDefault = sameId(defaultBible, row.id);
        const chooseDefault = () => onDefault(row.id);
        const removeRow = (event: MouseEvent<HTMLButtonElement>) => onRemove(row, event);
        if (onShow) return <CompactRow key={row.id} label={row.label} language={row.language}
          topAction={row.saved ? <RemoveButton label={row.label} focusId={isDefault ? row.id : undefined} disabled={savingDefault} onRemove={removeRow} /> : null}>
          {row.saved
            ? <DefaultButton label={row.label} isDefault={isDefault} disabled={savingDefault} onChoose={chooseDefault} className="-ml-2" />
            : <SaveButton label={row.label} onSave={() => onSave(row)} className="-ml-2" />}
          {isDefault ? null : <span className="flex shrink-0 items-center gap-2 text-xs text-foreground/70">
            <span aria-hidden="true">Compare</span>
            <button type="button" role="switch" aria-checked={row.shown} aria-label={`Compare ${row.label}`} data-bible-id={row.id}
              className="marker-switch" onClick={() => onShow(row)}><span className="marker-switch-knob" aria-hidden="true" /></button>
          </span>}
        </CompactRow>;
        return <li key={row.id} className="flex items-center gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium" dir="auto">{row.label}</p>
            <p className="mt-0.5 break-words text-xs text-foreground/60">
              {[row.language, row.abbreviation, row.saved ? "" : "Not saved"].filter(Boolean).join(" · ")}
            </p>
          </div>
          {row.saved ? <>
            <DefaultButton label={row.label} isDefault={isDefault} disabled={savingDefault} onChoose={chooseDefault} />
            <RemoveButton label={row.label} focusId={row.id} disabled={savingDefault} onRemove={removeRow} />
          </> : <SaveButton label={row.label} onSave={() => onSave(row)} />}
        </li>;
      })}
    </ul>
    {rows.length || onShow ? null : <p className="text-xs text-foreground/60">Add a Bible to read it verse by verse beside the base text.</p>}
    <button type="button" data-add-bible onClick={onAdd} aria-haspopup="dialog"
      className="w-full rounded-lg border border-[color:var(--surface-border)] bg-background px-3 py-2.5 text-sm font-medium hover:bg-[color:var(--surface-button-hover)]">
      + Add Bible
    </button>
  </div>;
}

export default function BibleTranslationControls({ shown = NO_COMPARISONS, onShownChange }: Props) {
  const { showLdsContent } = useFaithTradition();
  const editorTitleId = useId();
  const jstDescriptionId = useId();
  const favorites = useFavoriteTranslations();
  const [defaultBible, setDefaultBible] = useDefaultBible();
  const [savingDefault, startDefaultTransition] = useTransition();
  const [defaultError, setDefaultError] = useState<string | null>(null);
  function chooseDefault(id: string) {
    startDefaultTransition(async () => {
      setDefaultError(null);
      try { await setDefaultBible(id); }
      catch { setDefaultError("Couldn’t save your default Bible. Please try again."); }
    });
  }
  const [jstEnabled, setJstEnabled] = useJstPreference();
  const [view, setView] = useState<View | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pressedBackdrop = useRef(false);
  const open = view !== null;
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; });

  const unsavedIds = shown.filter((id) => !favorites.some((item) => sameId(item.id, id)));
  const needsCatalogNames = unsavedIds.some((id) => !KNOWN_BIBLES.some((item) => sameId(item.id, id)));
  const { catalog } = useTranslationCatalog(needsCatalogNames);
  const rows: ListRow[] = [
    ...favorites.map((item) => ({ ...item, saved: true, shown: shown.some((id) => sameId(id, item.id)) })),
    ...unsavedIds.map((id) => {
      const known = KNOWN_BIBLES.find((item) => sameId(item.id, id));
      const entry = catalog?.find((item) => sameId(item.id, id));
      const described = known ?? (entry ? { id, label: translationTitle(entry), language: translationLanguage(entry), abbreviation: entry.shortName } : { id, label: id });
      return { ...described, id, saved: false, shown: true };
    }),
  ];

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    // A native listener: React listens on the document, too late to keep reader settings (also listening there)
    // from closing behind the editor. Escape in the language chooser only steps back to the list of Bibles.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (viewRef.current === "language") {
        event.preventDefault();
        setView("catalog");
      }
    }
    dialog.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function saveBible(next: FavoriteTranslation) {
    const current = readFavoriteTranslations();
    if (!current.some((item) => sameId(item.id, next.id))) writeFavoriteTranslations([...current, next]);
  }

  function goTo(next: View | null) {
    if (next === null) dialogRef.current?.close();
    else setView(next);
    scrollRef.current?.scrollTo(0, 0);
  }

  function addBible(next: FavoriteTranslation) {
    saveBible(next);
    onShownChange?.(next.id, true);
    goTo("list");
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>(`[data-bible-id="${CSS.escape(next.id)}"]`)?.focus());
  }

  function removeBible(row: ListRow, event: MouseEvent<HTMLButtonElement>) {
    // Focus would otherwise fall to the page when this row disappears.
    event.currentTarget.closest("[data-bible-list]")?.querySelector<HTMLElement>("[data-add-bible]")?.focus();
    const remove = () => {
      writeFavoriteTranslations(readFavoriteTranslations().filter((item) => !sameId(item.id, row.id)));
      removeSavedComparison(row.id);
      if (row.shown) onShownChange?.(row.id, false);
    };
    if (sameId(defaultBible, row.id)) {
      startDefaultTransition(async () => {
        setDefaultError(null);
        try { await setDefaultBible("lds"); remove(); }
        catch { setDefaultError("Couldn’t remove your default Bible. Please try again."); }
      });
    } else remove();
  }

  const listProps = {
    rows,
    defaultBible,
    onDefault: chooseDefault,
    savingDefault,
    onShow: onShownChange ? (row: ListRow) => onShownChange(row.id, !row.shown) : undefined,
    onRemove: removeBible,
    onSave: ({ id, label, language, abbreviation }: ListRow) => saveBible({ id, label, language, abbreviation }),
    onAdd: () => goTo("catalog"),
  };

  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-medium">Your Bibles</h3>
      {onShownChange ? null : <button type="button" onClick={() => goTo("list")} aria-haspopup="dialog" aria-label="Open Your Bibles in a larger view" title="Expand"
        className="rounded-lg p-1.5 text-foreground/55 hover:bg-[color:var(--surface-button-hover)] hover:text-foreground">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
          <path d="M12 4h4v4M8 16H4v-4M16 4l-5 5M4 16l5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>}
    </div>
    {onShownChange ? null : <p className="text-xs text-foreground/60">Your default Bible is the main text when you open Bible chapters. Removing it restores the King James Bible.</p>}
    {defaultError ? <p role="alert" className="text-xs text-red-700 dark:text-red-300">{defaultError}</p> : null}
    <BibleList {...listProps} />
    <dialog ref={dialogRef} aria-labelledby={editorTitleId} onClose={() => setView(null)}
      onPointerDown={(event) => { pressedBackdrop.current = event.target === event.currentTarget; }}
      onClick={(event) => { if (pressedBackdrop.current && event.target === event.currentTarget) goTo(null); }}
      className={`fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-background p-0 text-foreground backdrop:bg-black/40 open:flex open:flex-col md:m-auto md:max-h-[calc(100dvh-4rem)] md:rounded-2xl md:border md:border-[color:var(--surface-border)] md:shadow-[var(--surface-shadow-lift)] ${
        view === "list" ? "md:h-fit md:w-[min(36rem,calc(100vw-4rem))]" : "md:h-[min(48rem,calc(100dvh-4rem))] md:w-[min(60rem,calc(100vw-4rem))]"}`}>
      {view ? <div className="flex min-h-0 flex-1 flex-col text-left font-sans">
        <header className="shrink-0 border-b border-[color:var(--surface-border)]">
          <div className="mx-auto grid max-w-xl grid-cols-[5rem_1fr_5rem] items-center gap-2 px-4 py-3 md:max-w-none md:px-5">
            {view === "list" ? <span /> : <button type="button" onClick={() => goTo(view === "language" ? "catalog" : "list")}
              className="justify-self-start rounded-lg px-2 py-2 text-sm">‹ Back</button>}
            <h2 id={editorTitleId} className="text-center text-base font-medium">{TITLES[view]}</h2>
            <button type="button" onClick={() => goTo(null)}
              className="justify-self-end rounded-lg border border-[color:var(--surface-border)] px-4 py-2 text-sm font-medium">Done</button>
          </div>
        </header>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-xl px-4 py-5 md:max-w-none md:px-8 md:py-6">
            {view === "list" ? <BibleList {...listProps} />
              : <TranslationCatalogPicker savedIds={favorites.map((item) => item.id)} onAdd={addBible}
                choosingLanguage={view === "language"} onChoosingLanguageChange={(next) => goTo(next ? "language" : "catalog")} />}
          </div>
        </div>
      </div> : null}
    </dialog>
    {showLdsContent ? <div data-jst-setting className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p aria-hidden="true" className="text-sm font-medium">Joseph Smith Translation</p>
        {onShownChange ? null : <p id={jstDescriptionId} className="mt-0.5 text-xs leading-relaxed text-foreground/60">When the LDS edition is the main text, show selected JST passages in place of the KJV verses they revise, with the JST&apos;s own wording underlined. <a href={JST_SOURCE_DOCS_URL} target="_blank" rel="noreferrer" className="underline">Source</a></p>}
      </div>
      <button type="button" role="switch" aria-checked={jstEnabled} aria-label="Joseph Smith Translation (JST)" aria-describedby={onShownChange ? undefined : jstDescriptionId}
        className="marker-switch shrink-0" onClick={() => setJstEnabled(!jstEnabled)}><span className="marker-switch-knob" aria-hidden="true" /></button>
    </div> : null}
  </div>;
}
