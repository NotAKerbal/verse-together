import type { HelloaoTranslation } from "./helloaoApi";

// IDs verified against the provider's catalog. These use HelloAO, not bible-api.com's IDs.
export const FEATURED_BIBLES = [
  { id: "BSB", shortLabel: "BSB", label: "Berean Standard Bible" },
  { id: "eng_net", shortLabel: "NET", label: "NET Bible" },
  { id: "eng_webu", shortLabel: "WEB", label: "World English Bible Updated" },
  { id: "eng_fbv", shortLabel: "FBV", label: "Free Bible Version" },
  { id: "eng_lsv", shortLabel: "LSV", label: "Literal Standard Version" },
] as const;

export const DEFAULT_CATALOG_LANGUAGE = "eng";
export const ALL_LANGUAGES = "all";

export type CatalogLanguage = { id: string; label: string; nativeName?: string; count: number };

// Editions people often look for that need a licensed source our provider doesn't offer.
const LICENSED_ONLY = ["nrsvue", "nrsv", "niv", "nlt", "csb", "esv"];

const sameText = (a: string, b: string) => searchable(a).replace(/\W+/g, "") === searchable(b).replace(/\W+/g, "");

/** The name readers most likely recognize: the provider's English name, else its own name. */
export function translationTitle(item: HelloaoTranslation): string {
  return item.englishName?.trim() || item.name?.trim() || item.id;
}

/** The edition's own name when it adds something to the title (often in the Bible's language). */
export function translationNativeName(item: HelloaoTranslation, title = translationTitle(item)): string | undefined {
  const native = item.name?.trim();
  return native && !sameText(native, title) ? native : undefined;
}

export function translationAbbreviation(item: HelloaoTranslation): string {
  return item.shortName?.trim() || item.id;
}

export function translationLanguage(item: HelloaoTranslation): string {
  return item.languageEnglishName || item.languageName || item.language || "Unknown language";
}

/** "Spanish · español" when the language's own name differs from its English name. */
export function languageDisplayName(language: { label: string; nativeName?: string }): string {
  return language.nativeName && !sameText(language.nativeName, language.label) ? `${language.label} · ${language.nativeName}` : language.label;
}

function searchable(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function queryWords(query: string): string[] {
  return searchable(query.trim()).split(/\s+/).filter(Boolean);
}

export function catalogLanguages(catalog: HelloaoTranslation[]): CatalogLanguage[] {
  const languages = new Map<string, CatalogLanguage>();
  for (const item of catalog) {
    const id = item.language || "unknown";
    const previous = languages.get(id);
    languages.set(id, previous ? { ...previous, nativeName: previous.nativeName ?? item.languageName, count: previous.count + 1 }
      : { id, label: translationLanguage(item), nativeName: item.languageName, count: 1 });
  }
  return [...languages.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Languages for the chooser. Without a query: most Bibles first (a count of this library, not popularity).
 * With a query: exact name or code, then names starting with it, then words starting with it, then anywhere.
 */
export function searchCatalogLanguages(languages: CatalogLanguage[], query: string): CatalogLanguage[] {
  const words = queryWords(query);
  const byCount = (a: CatalogLanguage, b: CatalogLanguage) => b.count - a.count || a.label.localeCompare(b.label);
  if (!words.length) return [...languages].sort(byCount);
  const phrase = words.join(" ");
  const ranked: Array<{ language: CatalogLanguage; rank: number }> = [];
  for (const language of languages) {
    const names = [language.label, language.nativeName ?? ""].map(searchable);
    const haystack = `${names.join(" ")} ${language.id.toLowerCase()}`;
    if (!words.every((word) => haystack.includes(word))) continue;
    const rank = names.includes(phrase) || language.id.toLowerCase() === phrase ? 0
      : names.some((name) => name.startsWith(phrase)) ? 1
        : names.some((name) => name.split(/[\s(),-]+/).some((part) => part.startsWith(words[0]))) ? 2 : 3;
    ranked.push({ language, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank || byCount(a.language, b.language)).map((item) => item.language);
}

function featuredRank(id: string): number {
  const index = FEATURED_BIBLES.findIndex((item) => item.id === id);
  return index < 0 ? FEATURED_BIBLES.length : index;
}

function matchRank(item: HelloaoTranslation, phrase: string): number {
  const abbreviation = searchable(translationAbbreviation(item));
  const names = [translationTitle(item), item.name ?? ""].map(searchable);
  const id = item.id.toLowerCase();
  if (abbreviation === phrase || id === phrase || id.slice(id.indexOf("_") + 1) === phrase) return 0;
  if (names.some((name) => name.startsWith(phrase))) return 1;
  if (names.some((name) => name.includes(phrase))) return 2;
  return 3;
}

export function filterTranslationCatalog(catalog: HelloaoTranslation[], language: string, query: string) {
  const words = queryWords(query);
  const phrase = words.join(" ");
  const compare = (a: HelloaoTranslation, b: HelloaoTranslation) => (phrase ? matchRank(a, phrase) - matchRank(b, phrase) : 0)
    || featuredRank(a.id) - featuredRank(b.id)
    || (language === ALL_LANGUAGES ? translationLanguage(a).localeCompare(translationLanguage(b)) : 0)
    || translationTitle(a).localeCompare(translationTitle(b));
  return catalog.filter((item) => {
    if (language !== ALL_LANGUAGES && (item.language || "unknown") !== language) return false;
    const haystack = searchable([item.id, item.name, item.englishName, item.shortName, item.language,
      item.languageName, item.languageEnglishName].filter(Boolean).join(" "));
    return words.every((word) => haystack.includes(word));
  }).sort(compare);
}

/** True when the search is for an edition that needs a licensed source we don't have. */
export function isLicensedOnlyQuery(query: string): boolean {
  return queryWords(query).some((word) => LICENSED_ONLY.includes(word.replace(/[^a-z]/g, "")));
}

/** The shown comparisons after turning one on or off. Order and the provider's ID case are kept; no duplicates. */
export function withComparison(selected: string[], target: string, shown: boolean): string[] {
  const rest = selected.filter((id) => id.toLowerCase() !== target.toLowerCase());
  if (!shown) return rest;
  return rest.length === selected.length ? [...selected, target] : selected;
}

/** Rewrite the reader's `translation`/`compare` params to `selected`, keeping every unrelated param. */
export function comparisonQuery(search: string, selected: string[]): string {
  const params = new URLSearchParams(search);
  params.delete("translation");
  params.delete("compare");
  if (selected[0]) params.set("translation", selected[0]);
  selected.slice(1).forEach((id) => params.append("compare", id));
  return params.toString();
}
