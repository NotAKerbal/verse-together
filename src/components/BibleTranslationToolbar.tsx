"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TranslationCatalogPicker, { useTranslationCatalog } from "@/components/TranslationCatalogPicker";
import { BIBLE_TRANSLATION_OPTIONS, type BibleTranslationId } from "@/lib/bibleCanon";
import { FEATURED_BIBLES, comparisonQuery, translationLanguage, translationTitle, withComparison } from "@/lib/translationCatalog";
import { JST_SOURCE_DOCS_URL } from "@/lib/jst";
import { useJstPreference } from "@/lib/jstPreference";
import {
  readFavoriteTranslations, useFavoriteTranslations, writeFavoriteTranslations, type FavoriteTranslation,
} from "@/lib/translationFavorites";

type Props = { volume: string; book: string; chapter: string; compare: BibleTranslationId[] };
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

function BibleList({ rows, onShow, onRemove, onSave, onAdd }: {
  rows: ListRow[];
  onShow: (row: ListRow) => void;
  onRemove: (row: ListRow, event: MouseEvent<HTMLButtonElement>) => void;
  onSave: (row: ListRow) => void;
  onAdd: () => void;
}) {
  return <div data-bible-list className="space-y-3">
    <ul aria-label="Your Bibles" className="divide-y divide-[color:var(--surface-border)] rounded-xl border border-[color:var(--surface-border)]">
      <li className="px-3 py-2.5">
        <p className="text-sm font-medium">King James Bible (LDS edition)</p>
        <p className="mt-0.5 text-xs text-foreground/60">English · Base text, always shown</p>
      </li>
      {rows.map((row) => <li key={row.id} className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium" dir="auto">{row.label}</p>
          <p className="mt-0.5 break-words text-xs text-foreground/60">
            {[row.language, row.abbreviation, row.saved ? "" : "Not saved"].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={row.shown} aria-label={`Show ${row.label}`} data-bible-id={row.id}
          className="marker-switch shrink-0" onClick={() => onShow(row)}><span className="marker-switch-knob" aria-hidden="true" /></button>
        {row.saved
          ? <button type="button" onClick={(event) => onRemove(row, event)} aria-label={`Remove ${row.label}`} title="Remove"
            className="shrink-0 rounded-lg p-2 text-foreground/50 hover:bg-[color:var(--surface-button-hover)] hover:text-foreground"><TrashIcon /></button>
          : <button type="button" onClick={() => onSave(row)} aria-label={`Save ${row.label}`}
            className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium underline underline-offset-2">Save</button>}
      </li>)}
    </ul>
    {rows.length ? null : <p className="text-xs text-foreground/60">Add a Bible to read it verse by verse beside the base text.</p>}
    <button type="button" data-add-bible onClick={onAdd} aria-haspopup="dialog"
      className="w-full rounded-lg border border-[color:var(--surface-border)] bg-background px-3 py-2.5 text-sm font-medium hover:bg-[color:var(--surface-button-hover)]">
      + Add Bible
    </button>
  </div>;
}

export default function BibleTranslationToolbar({ volume, book, chapter, compare }: Props) {
  const favorites = useFavoriteTranslations();
  const [jstEnabled, setJstEnabled] = useJstPreference();
  const [view, setView] = useState<View | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  // Switches show the requested state while the chapter reloads, and the next change builds on it, so several quick
  // taps can't be computed from a URL that hasn't caught up yet.
  const [shown, setShownOptimistic] = useOptimistic(compare);
  const [, startTransition] = useTransition();
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

  function setShown(id: string, on: boolean) {
    const next = withComparison(shown, id, on);
    if (next.length === shown.length && next.every((item, index) => item === shown[index])) return;
    const query = comparisonQuery(searchParams.toString(), next);
    startTransition(() => {
      setShownOptimistic(next);
      router.replace(`/browse/${volume}/${book}/${chapter}${query ? `?${query}` : ""}`, { scroll: false });
    });
  }

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
    setShown(next.id, true);
    goTo("list");
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>(`[data-bible-id="${CSS.escape(next.id)}"]`)?.focus());
  }

  function removeBible(row: ListRow, event: MouseEvent<HTMLButtonElement>) {
    // Focus would otherwise fall to the page when this row disappears.
    event.currentTarget.closest("[data-bible-list]")?.querySelector<HTMLElement>("[data-add-bible]")?.focus();
    writeFavoriteTranslations(readFavoriteTranslations().filter((item) => !sameId(item.id, row.id)));
    if (row.shown) setShown(row.id, false);
  }

  const listProps = {
    rows,
    onShow: (row: ListRow) => setShown(row.id, !row.shown),
    onRemove: removeBible,
    onSave: ({ id, label, language, abbreviation }: ListRow) => saveBible({ id, label, language, abbreviation }),
    onAdd: () => goTo("catalog"),
  };

  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-medium">Your Bibles</h3>
      <button type="button" onClick={() => goTo("list")} aria-haspopup="dialog" aria-label="Open Your Bibles full screen" title="Full screen"
        className="rounded-lg p-1.5 text-foreground/55 hover:bg-[color:var(--surface-button-hover)] hover:text-foreground">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
          <path d="M12 4h4v4M8 16H4v-4M16 4l-5 5M4 16l5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
    <BibleList {...listProps} />
    <dialog ref={dialogRef} aria-labelledby="bible-editor-title" onClose={() => setView(null)}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-background p-0 text-foreground backdrop:bg-black/40">
      {view ? <div className="flex h-full flex-col text-left font-sans">
        <header className="shrink-0 border-b border-[color:var(--surface-border)]">
          <div className="mx-auto grid max-w-xl grid-cols-[5rem_1fr_5rem] items-center gap-2 px-4 py-3">
            {view === "list" ? <span /> : <button type="button" onClick={() => goTo(view === "language" ? "catalog" : "list")}
              className="justify-self-start rounded-lg px-2 py-2 text-sm">‹ Back</button>}
            <h2 id="bible-editor-title" className="text-center text-base font-medium">{TITLES[view]}</h2>
            <button type="button" onClick={() => goTo(null)}
              className="justify-self-end rounded-lg border border-[color:var(--surface-border)] px-4 py-2 text-sm font-medium">Done</button>
          </div>
        </header>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-xl px-4 py-5">
            {view === "list" ? <BibleList {...listProps} />
              : <TranslationCatalogPicker savedIds={favorites.map((item) => item.id)} onAdd={addBible}
                choosingLanguage={view === "language"} onChoosingLanguageChange={(next) => goTo(next ? "language" : "catalog")} />}
          </div>
        </div>
      </div> : null}
    </dialog>
    <details className="text-xs">
      <summary className="cursor-pointer py-2 text-foreground/70">Joseph Smith Translation</summary>
      <div className="mt-1 flex items-start justify-between gap-3">
        <p id="jst-toggle-description" className="text-[11px] leading-relaxed text-foreground/60">Show selected JST passages in place of the KJV verses they revise. <a href={JST_SOURCE_DOCS_URL} target="_blank" rel="noreferrer" className="underline">Source</a></p>
        <button type="button" role="switch" aria-checked={jstEnabled} aria-label="Joseph Smith Translation (JST)" aria-describedby="jst-toggle-description"
          className="marker-switch mt-0.5 shrink-0" onClick={() => setJstEnabled(!jstEnabled)}><span className="marker-switch-knob" aria-hidden="true" /></button>
      </div>
    </details>
  </div>;
}
