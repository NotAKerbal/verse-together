// The bundled scripture navigation catalog (a few KB), shared by the browser and the server. It carries the
// volume, book, chapter, and verse counts so navigation never has to load a verse bundle.

import rawCatalog from "./generated/scriptureCatalog.json";
import { createScriptureCatalogIndex, type RawScriptureCatalog } from "./scriptureCatalogIndex";

export type { CatalogBook, CatalogVolume, ScriptureChapterDelineation } from "./scriptureCatalogIndex";

export const scriptureCatalog = createScriptureCatalogIndex(rawCatalog as RawScriptureCatalog);
