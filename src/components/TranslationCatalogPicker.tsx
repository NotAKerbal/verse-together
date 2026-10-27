"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { HelloaoTranslation } from "@/lib/helloaoApi";
import type { FavoriteTranslation } from "@/lib/translationFavorites";
import {
  ALL_LANGUAGES, DEFAULT_CATALOG_LANGUAGE, FEATURED_BIBLES, catalogLanguages, filterTranslationCatalog, isLicensedOnlyQuery,
  languageDisplayName, searchCatalogLanguages, translationLanguage, translationNativeName, translationTitle,
} from "@/lib/translationCatalog";

type Props = {
  savedIds: string[];
  onAdd: (translation: FavoriteTranslation) => void;
  /** The language chooser replaces the list while open; the editor owns this so its Back and Escape can close it. */
  choosingLanguage: boolean;
  onChoosingLanguageChange: (open: boolean) => void;
};

const PAGE_SIZE = 40;
const LANGUAGE_PAGE_SIZE = 40;
const button = "rounded-lg border border-[color:var(--surface-border)] bg-[color:var(--surface-card)] hover:bg-[color:var(--surface-button-hover)]";

// One copy of the library per page load: it's large, and the editor and the saved list both read it.
let cachedCatalog: HelloaoTranslation[] | null = null;

export function useTranslationCatalog(enabled = true) {
  const [catalog, setCatalog] = useState(cachedCatalog);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || catalog) return;
    const controller = new AbortController();
    fetch("/api/helloao/translations", { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json() as { ok: boolean; translations?: HelloaoTranslation[] };
        if (!res.ok || !data.ok || !Array.isArray(data.translations)) throw new Error("Catalog unavailable");
        cachedCatalog = data.translations;
        setCatalog(data.translations);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [enabled, catalog, attempt]);
  return { catalog, error, loading: enabled && !catalog && !error, retry: () => { setError(false); setAttempt(attempt + 1); } };
}

type Row = { item: HelloaoTranslation; title: string; abbreviation?: string };

function toRow(item: HelloaoTranslation): Row {
  const featured = FEATURED_BIBLES.find((entry) => entry.id === item.id);
  return featured ? { item, title: featured.label, abbreviation: featured.shortLabel }
    : { item, title: translationTitle(item), abbreviation: item.shortName };
}

function featuredRows(catalog: HelloaoTranslation[] | null): Row[] {
  return FEATURED_BIBLES.map((featured) => ({
    item: catalog?.find((entry) => entry.id === featured.id) ?? { id: featured.id, name: featured.label, language: "eng", languageEnglishName: "English" },
    title: featured.label,
    abbreviation: featured.shortLabel,
  }));
}

function BibleRow({ row, added, showLanguage, onAdd }: { row: Row; added: boolean; showLanguage: boolean; onAdd: Props["onAdd"] }) {
  const { item, title, abbreviation } = row;
  const language = translationLanguage(item);
  const subtitle = [abbreviation, translationNativeName(item, title), showLanguage ? language : ""].filter(Boolean).join(" · ");
  return <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
    <div className="min-w-0 flex-1">
      <p className="break-words text-sm font-medium" dir="auto">{title}</p>
      {subtitle ? <p className="mt-0.5 break-words text-xs text-foreground/60" dir="auto">{subtitle}</p> : null}
    </div>
    <button type="button" aria-disabled={added || undefined} aria-label={added ? `${title} added` : `Add ${title}`}
      onClick={() => { if (!added) onAdd({ id: item.id, label: title, language, abbreviation }); }}
      className={`shrink-0 px-3 py-1.5 text-xs font-medium ${added ? "cursor-default text-foreground/55" : button}`}>
      {added ? "Added" : "Add"}
    </button>
  </li>;
}

function LanguageChooser({ languages, current, onChoose }: { languages: ReturnType<typeof catalogLanguages>; current: string; onChoose: (id: string) => void }) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(LANGUAGE_PAGE_SIZE);
  const matches = useMemo(() => searchCatalogLanguages(languages, query), [languages, query]);
  const showAll = "all languages".startsWith(query.trim().toLowerCase());
  const options = [...(showAll ? [{ id: ALL_LANGUAGES, label: "All languages" }] : []), ...matches];
  return <div className="space-y-3">
    <label htmlFor={inputId} className="sr-only">Find a language</label>
    <input id={inputId} type="search" autoFocus value={query} autoComplete="off" spellCheck={false}
      onChange={(event) => { setQuery(event.target.value); setLimit(LANGUAGE_PAGE_SIZE); }}
      onKeyDown={(event) => { if (event.key === "Enter" && options[0]) { event.preventDefault(); onChoose(options[0].id); } }}
      placeholder="Search languages, e.g. Spanish or español"
      className="soft-input w-full px-3 py-2.5 text-sm" />
    {options.length ? <ul aria-label="Languages" className="panel-card divide-y divide-[color:var(--surface-border)]">
      {options.slice(0, limit).map((item) => <li key={item.id}>
        <button type="button" aria-pressed={item.id === current} onClick={() => onChoose(item.id)}
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-[color:var(--surface-button-hover)]">
          <span className="min-w-0 break-words" dir="auto">{languageDisplayName(item)}</span>
          {item.id === current ? <span aria-hidden="true" className="shrink-0">✓</span> : null}
        </button>
      </li>)}
    </ul> : <p className="text-sm text-foreground/65">No language matches “{query.trim()}”.</p>}
    {options.length > limit ? <button type="button" onClick={() => setLimit(limit + LANGUAGE_PAGE_SIZE)} className={`w-full p-2.5 text-xs font-medium ${button}`}>Show more</button> : null}
  </div>;
}

export default function TranslationCatalogPicker({ savedIds, onAdd, choosingLanguage, onChoosingLanguageChange }: Props) {
  const searchId = useId();
  const { catalog, error, loading, retry } = useTranslationCatalog();
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState(DEFAULT_CATALOG_LANGUAGE);
  const [browsing, setBrowsing] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const savedSet = new Set(savedIds.map((id) => id.toLowerCase()));
  const languages = useMemo(() => catalogLanguages(catalog ?? []), [catalog]);
  const matches = useMemo(() => filterTranslationCatalog(catalog ?? [], language, query), [catalog, language, query]);
  const otherLanguageMatches = useMemo(() => language === ALL_LANGUAGES || !query.trim() ? 0
    : filterTranslationCatalog(catalog ?? [], ALL_LANGUAGES, query).length, [catalog, language, query]);

  const languageName = language === ALL_LANGUAGES ? "All languages"
    : languages.find((item) => item.id === language)?.label ?? (language === DEFAULT_CATALOG_LANGUAGE ? "English" : language);
  // The opening view is a short list of modern English Bibles; everything else is one tap away.
  const featuredOnly = language === DEFAULT_CATALOG_LANGUAGE && !query.trim() && !browsing;
  const rows = featuredOnly ? featuredRows(catalog) : matches.map(toRow);

  function chooseLanguage(next: string) {
    setLanguage(next);
    setLimit(PAGE_SIZE);
    onChoosingLanguageChange(false);
  }

  if (choosingLanguage && catalog) return <LanguageChooser languages={languages} current={language} onChoose={chooseLanguage} />;

  const row = (item: Row) => <BibleRow key={item.item.id} row={item} added={savedSet.has(item.item.id.toLowerCase())}
    showLanguage={language === ALL_LANGUAGES} onAdd={onAdd} />;

  return (
    <div className="space-y-3">
      <label htmlFor={searchId} className="sr-only">Search Bibles</label>
      <input id={searchId} type="search" autoFocus data-autofocus value={query} autoComplete="off" spellCheck={false}
        onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}
        placeholder="Search by name or abbreviation"
        className="soft-input w-full px-3 py-2.5 text-sm" />
      <button type="button" disabled={!catalog} onClick={() => onChoosingLanguageChange(true)}
        aria-label={`Language: ${languageName}. Change language`}
        className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm disabled:opacity-60 ${button}`}>
        <span className="min-w-0 truncate"><span className="text-foreground/60">Language: </span><span className="font-medium">{languageName}</span></span>
        <span aria-hidden="true" className="shrink-0 text-xs text-foreground/60">Change ›</span>
      </button>

      {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--surface-border)] p-3 text-xs">
        <p>The full list of Bibles couldn’t load.</p>
        <button type="button" onClick={retry} className={`px-3 py-1.5 font-medium ${button}`}>Try again</button>
      </div> : null}

      {rows.length ? <ul aria-label="Bibles" className="panel-card divide-y divide-[color:var(--surface-border)]">
        {(featuredOnly ? rows : rows.slice(0, limit)).map(row)}
      </ul> : null}

      {loading && !featuredOnly ? <div aria-hidden="true" className="panel-card divide-y divide-[color:var(--surface-border)]">
        {[0, 1, 2].map((index) => <div key={index} className="px-4 py-4"><div className="h-3 w-2/5 animate-pulse rounded bg-foreground/10" /></div>)}
      </div> : null}

      {featuredOnly && catalog ? <button type="button" onClick={() => setBrowsing(true)} className="w-full py-2 text-xs font-medium underline underline-offset-2">
        Browse all English Bibles
      </button> : null}
      {!featuredOnly && rows.length > limit ? <button type="button" onClick={() => setLimit(limit + PAGE_SIZE)} className={`w-full p-2.5 text-xs font-medium ${button}`}>
        Show more
      </button> : null}

      {catalog && !rows.length ? <div role="status" className="space-y-2 rounded-xl border border-dashed border-[color:var(--surface-border)] p-4 text-sm">
        <p>No Bibles match “{query.trim()}”{language === ALL_LANGUAGES ? "" : ` in ${languageName}`}.</p>
        {isLicensedOnlyQuery(query) ? <p className="text-xs leading-relaxed text-foreground/65">
          NRSVue, NIV, NLT, CSB and ESV need a publisher’s license, so they aren’t available here.
        </p> : null}
        {otherLanguageMatches ? <button type="button" onClick={() => chooseLanguage(ALL_LANGUAGES)} className="text-xs font-medium underline underline-offset-2">
          Search all languages
        </button> : null}
      </div> : null}
    </div>
  );
}
