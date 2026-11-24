// Loads the Strong's datasets (server only: about 4 MB of JSON the browser never downloads) and answers lookups.

import {
  STRONGS_TITLES,
  isStrongsDataset,
  prepareStrongsEntries,
  searchStrongsEntries,
  type StrongsDataset,
  type StrongsLanguage,
  type StrongsLookup,
} from "./strongsLexicon";

type Loaded = { dataset: StrongsDataset; prepared: ReturnType<typeof prepareStrongsEntries> };

const loaded = new Map<StrongsLanguage, Promise<Loaded>>();

function loadDataset(language: StrongsLanguage): Promise<Loaded> {
  let request = loaded.get(language);
  if (!request) {
    const load = language === "hebrew" ? import("./generated/strongsHebrew.json") : import("./generated/strongsGreek.json");
    request = load.then((module): Loaded => {
      const dataset: unknown = module.default;
      if (!isStrongsDataset(dataset)) throw new Error(`The bundled Strong's ${language} data is malformed; regenerate it.`);
      return { dataset, prepared: prepareStrongsEntries(dataset.entries) };
    });
    request.catch(() => loaded.delete(language));
    loaded.set(language, request);
  }
  return request;
}

export function isStrongsLanguage(value: unknown): value is StrongsLanguage {
  return value === "hebrew" || value === "greek";
}

export async function lookupStrongs(language: StrongsLanguage, word: string, limit = 8): Promise<StrongsLookup> {
  const { dataset, prepared } = await loadDataset(language);
  const { term, matches, total } = searchStrongsEntries(prepared, word, { limit });
  return {
    language,
    term,
    matches,
    total,
    attribution: { title: STRONGS_TITLES[language], sourceUrl: dataset.source, license: dataset.license },
  };
}
