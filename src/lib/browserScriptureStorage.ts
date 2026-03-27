"use client";

import { parseScriptureReferenceQuery } from "@/lib/scriptureQuickNav";

type ScriptureVerse = {
  verse: number;
  text: string;
};

type ScriptureChapter = {
  chapter: number;
  verses: ScriptureVerse[];
};

type ScriptureBookBundle = {
  book: string;
  title: string;
  longTitle?: string | null;
  subtitle?: string | null;
  shortTitle?: string | null;
  chapterCount: number;
  chapters: ScriptureChapter[];
};

type ScriptureVolumeInfo = {
  volume: string;
  title: string;
  longTitle?: string | null;
  subtitle?: string | null;
  shortTitle?: string | null;
  bundlePath: string;
  bookCount: number;
  chapterCount: number;
  verseCount: number;
};

type ScriptureVolumeBundle = {
  version: string;
  volume: ScriptureVolumeInfo;
  books: ScriptureBookBundle[];
};

type ScriptureDatasetManifest = {
  version: string;
  generatedFrom: string;
  volumes: ScriptureVolumeInfo[];
  bookCount: number;
  chapterCount: number;
  verseCount: number;
};

type StoredMetaRecord = {
  key: "dataset";
  value: {
    state: ScriptureStorageState;
    version: string;
    updatedAt: number;
    progress?: ScriptureStorageProgress;
    error?: string;
  };
};

type StoredChapterRecord = {
  volume: string;
  book: string;
  chapter: number;
  reference: string;
  referenceKey: string;
  volumeTitle: string;
  bookTitle: string;
  verses: ScriptureVerse[];
};

type StoredVerseRecord = {
  volume: string;
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  referenceKey: string;
  volumeTitle: string;
  bookTitle: string;
  text: string;
  searchText: string;
};

export type ScriptureStorageState = "empty" | "installing" | "ready" | "error" | "bundle-only";

export type ScriptureStorageProgress = {
  completedVolumes: number;
  totalVolumes: number;
  completedChapters: number;
  totalChapters: number;
  completedVerses: number;
  totalVerses: number;
};

export type ScriptureStorageStatus = {
  supported: boolean;
  source: "indexeddb" | "bundle" | "unavailable";
  state: ScriptureStorageState;
  version?: string;
  updatedAt?: number;
  progress?: ScriptureStorageProgress;
  error?: string;
};

export type BrowserScriptureChapter = {
  volume: string;
  book: string;
  chapter: number;
  reference: string;
  volumeTitle: string;
  bookTitle: string;
  verses: ScriptureVerse[];
  source: "indexeddb" | "bundle";
  version: string;
};

export type ScriptureSearchOptions = {
  limit?: number;
  volume?: string;
  book?: string;
};

export type ScriptureSearchResult = {
  volume: string;
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  volumeTitle: string;
  bookTitle: string;
  text: string;
  source: "indexeddb" | "bundle";
  version: string;
};

type EnsureStorageOptions = {
  forceReload?: boolean;
  onProgress?: (progress: ScriptureStorageProgress) => void;
};

const DATASET_MANIFEST_PATH = "/scripture-data/manifest.json";
const DB_NAME = "scripture-browser-storage";
const DB_VERSION = 3;
const META_STORE = "meta";
const CHAPTERS_STORE = "chapters";
const VERSES_STORE = "verses";
const CHAPTERS_BY_REFERENCE_INDEX = "by_reference_key";
const VERSES_BY_VOLUME_INDEX = "by_volume";
const VERSES_BY_BOOK_INDEX = "by_book";
const LOCAL_STATUS_KEY = "scripture-browser-storage-status";

let manifestPromise: Promise<ScriptureDatasetManifest> | null = null;
const bundlePromiseByVolume = new Map<string, Promise<ScriptureVolumeBundle>>();
let installPromise: Promise<ScriptureStorageStatus> | null = null;

function ensureBrowserEnvironment() {
  if (typeof window === "undefined") {
    throw new Error("browserScriptureStorage can only be used in the browser.");
  }
}

function supportsIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function makeReferenceKey(value: string) {
  return normalizeText(value);
}

function makeReference(bookTitle: string, chapter: number) {
  return `${bookTitle} ${chapter}`;
}

function buildVerseSearchText(input: {
  volumeTitle: string;
  bookTitle: string;
  reference: string;
  verse: number;
  text: string;
}) {
  return normalizeText(
    `${input.volumeTitle} ${input.bookTitle} ${input.reference}:${input.verse} ${input.reference} ${input.text}`
  );
}

function toProgress(manifest: ScriptureDatasetManifest): ScriptureStorageProgress {
  return {
    completedVolumes: 0,
    totalVolumes: manifest.volumes.length,
    completedChapters: 0,
    totalChapters: manifest.chapterCount,
    completedVerses: 0,
    totalVerses: manifest.verseCount,
  };
}

function readLocalStatus(): ScriptureStorageStatus | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_STATUS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ScriptureStorageStatus;
  } catch {
    return null;
  }
}

function writeLocalStatus(status: ScriptureStorageStatus) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STATUS_KEY, JSON.stringify(status));
  } catch {
    // Ignore localStorage failures.
  }
}

function requestToPromise<T = void>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (request.transaction && event.oldVersion < 3) {
        if (db.objectStoreNames.contains(META_STORE)) {
          db.deleteObjectStore(META_STORE);
        }
        if (db.objectStoreNames.contains(CHAPTERS_STORE)) {
          db.deleteObjectStore(CHAPTERS_STORE);
        }
        if (db.objectStoreNames.contains(VERSES_STORE)) {
          db.deleteObjectStore(VERSES_STORE);
        }
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
        const chapterStore = db.createObjectStore(CHAPTERS_STORE, { keyPath: ["volume", "book", "chapter"] });
        chapterStore.createIndex(CHAPTERS_BY_REFERENCE_INDEX, "referenceKey", { unique: false });
      }
      if (!db.objectStoreNames.contains(VERSES_STORE)) {
        const verseStore = db.createObjectStore(VERSES_STORE, { keyPath: ["volume", "book", "chapter", "verse"] });
        verseStore.createIndex(VERSES_BY_VOLUME_INDEX, "volume", { unique: false });
        verseStore.createIndex(VERSES_BY_BOOK_INDEX, ["volume", "book"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB"));
  });
}

async function getManifest() {
  manifestPromise ??= fetch(DATASET_MANIFEST_PATH).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Unable to load bundled scripture manifest (${response.status})`);
    }
    return (await response.json()) as ScriptureDatasetManifest;
  });
  return manifestPromise;
}

export async function preloadBrowserScriptureManifest() {
  ensureBrowserEnvironment();
  await getManifest();
}

async function getVolumeBundle(volume: string) {
  const manifest = await getManifest();
  const volumeInfo = manifest.volumes.find((item) => item.volume === volume);
  if (!volumeInfo) {
    throw new Error(`Unknown scripture volume: ${volume}`);
  }

  const existing = bundlePromiseByVolume.get(volume);
  if (existing) return existing;

  const nextPromise = fetch(volumeInfo.bundlePath).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Unable to load bundled scripture volume (${response.status})`);
    }
    return (await response.json()) as ScriptureVolumeBundle;
  });
  bundlePromiseByVolume.set(volume, nextPromise);
  return nextPromise;
}

export async function preloadBrowserScriptureVolume(volume: string) {
  ensureBrowserEnvironment();
  await getVolumeBundle(volume);
}

async function readMetaRecord(db: IDBDatabase) {
  const transaction = db.transaction(META_STORE, "readonly");
  const record = await requestToPromise(
    transaction.objectStore(META_STORE).get("dataset")
  ) as StoredMetaRecord | undefined;
  await transactionDone(transaction);
  return record?.value;
}

async function writeMetaRecord(db: IDBDatabase, value: StoredMetaRecord["value"]) {
  const transaction = db.transaction(META_STORE, "readwrite");
  transaction.objectStore(META_STORE).put({ key: "dataset", value } satisfies StoredMetaRecord);
  await transactionDone(transaction);
}

function toStatus(
  source: "indexeddb" | "bundle" | "unavailable",
  meta: StoredMetaRecord["value"] | null,
  fallback?: Partial<ScriptureStorageStatus>
): ScriptureStorageStatus {
  return {
    supported: source !== "unavailable",
    source,
    state: meta?.state ?? fallback?.state ?? (source === "bundle" ? "bundle-only" : "empty"),
    version: meta?.version ?? fallback?.version,
    updatedAt: meta?.updatedAt ?? fallback?.updatedAt,
    progress: meta?.progress ?? fallback?.progress,
    error: meta?.error ?? fallback?.error,
  };
}

async function writeInstallStatus(
  db: IDBDatabase | null,
  source: "indexeddb" | "bundle",
  meta: StoredMetaRecord["value"]
) {
  const status = toStatus(source, meta);
  if (db) {
    await writeMetaRecord(db, meta);
  }
  writeLocalStatus(status);
  return status;
}

async function importBundleIntoDb(
  db: IDBDatabase,
  bundle: ScriptureVolumeBundle,
  progress: ScriptureStorageProgress
) {
  const transaction = db.transaction([CHAPTERS_STORE, VERSES_STORE], "readwrite");
  const chaptersStore = transaction.objectStore(CHAPTERS_STORE);
  const versesStore = transaction.objectStore(VERSES_STORE);

  for (const book of bundle.books) {
    for (const chapter of book.chapters) {
      const reference = makeReference(book.title, chapter.chapter);
      chaptersStore.put({
        volume: bundle.volume.volume,
        book: book.book,
        chapter: chapter.chapter,
        reference,
        referenceKey: makeReferenceKey(reference),
        volumeTitle: bundle.volume.title,
        bookTitle: book.title,
        verses: chapter.verses,
      } satisfies StoredChapterRecord);

      for (const verse of chapter.verses) {
        const verseReference = `${reference}:${verse.verse}`;
        versesStore.put({
          volume: bundle.volume.volume,
          book: book.book,
          chapter: chapter.chapter,
          verse: verse.verse,
          reference: verseReference,
          referenceKey: makeReferenceKey(verseReference),
          volumeTitle: bundle.volume.title,
          bookTitle: book.title,
          text: verse.text,
          searchText: buildVerseSearchText({
            volumeTitle: bundle.volume.title,
            bookTitle: book.title,
            reference,
            verse: verse.verse,
            text: verse.text,
          }),
        } satisfies StoredVerseRecord);
        progress.completedVerses += 1;
      }
      progress.completedChapters += 1;
    }
  }

  progress.completedVolumes += 1;
  await transactionDone(transaction);
}

async function clearDatasetStores(db: IDBDatabase) {
  const transaction = db.transaction([CHAPTERS_STORE, VERSES_STORE], "readwrite");
  transaction.objectStore(CHAPTERS_STORE).clear();
  transaction.objectStore(VERSES_STORE).clear();
  await transactionDone(transaction);
}

async function getStoredChapter(
  db: IDBDatabase,
  volume: string,
  book: string,
  chapter: number
) {
  const transaction = db.transaction(CHAPTERS_STORE, "readonly");
  const result = await requestToPromise(
    transaction.objectStore(CHAPTERS_STORE).get([volume, book, chapter])
  ) as StoredChapterRecord | undefined;
  await transactionDone(transaction);
  return result ?? null;
}

async function getStoredVerse(
  db: IDBDatabase,
  volume: string,
  book: string,
  chapter: number,
  verse: number
) {
  const transaction = db.transaction(VERSES_STORE, "readonly");
  const result = await requestToPromise(
    transaction.objectStore(VERSES_STORE).get([volume, book, chapter, verse])
  ) as StoredVerseRecord | undefined;
  await transactionDone(transaction);
  return result ?? null;
}

async function getStoredChapterByReferenceKey(db: IDBDatabase, referenceKey: string) {
  const transaction = db.transaction(CHAPTERS_STORE, "readonly");
  const result = await requestToPromise(
    transaction.objectStore(CHAPTERS_STORE).index(CHAPTERS_BY_REFERENCE_INDEX).get(referenceKey)
  ) as StoredChapterRecord | undefined;
  await transactionDone(transaction);
  return result ?? null;
}

async function searchStoredVerses(
  db: IDBDatabase,
  normalizedQuery: string,
  options: Required<Pick<ScriptureSearchOptions, "limit">> & Omit<ScriptureSearchOptions, "limit">
) {
  const transaction = db.transaction(VERSES_STORE, "readonly");
  const store = transaction.objectStore(VERSES_STORE);
  const source: IDBObjectStore | IDBIndex =
    options.volume && options.book
      ? store.index(VERSES_BY_BOOK_INDEX)
      : options.volume
      ? store.index(VERSES_BY_VOLUME_INDEX)
      : store;
  const range =
    options.volume && options.book
      ? IDBKeyRange.only([options.volume, options.book])
      : options.volume
      ? IDBKeyRange.only(options.volume)
      : undefined;

  const results = await new Promise<StoredVerseRecord[]>((resolve, reject) => {
    const matches: StoredVerseRecord[] = [];
    const request = source.openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || matches.length >= options.limit) {
        resolve(matches);
        return;
      }

      const value = cursor.value as StoredVerseRecord;
      const allowedVolume = !options.volume || value.volume === options.volume;
      const allowedBook = !options.book || value.book === options.book;
      if (allowedVolume && allowedBook && value.searchText.includes(normalizedQuery)) {
        matches.push(value);
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB cursor failed"));
  });

  await transactionDone(transaction);
  return results;
}

function toSearchResult(
  item: Pick<
    StoredVerseRecord,
    "volume" | "book" | "chapter" | "verse" | "reference" | "volumeTitle" | "bookTitle" | "text"
  >,
  source: "indexeddb" | "bundle",
  version: string
): ScriptureSearchResult {
  return {
    volume: item.volume,
    book: item.book,
    chapter: item.chapter,
    verse: item.verse,
    reference: item.reference,
    volumeTitle: item.volumeTitle,
    bookTitle: item.bookTitle,
    text: item.text,
    source,
    version,
  };
}

function toChapterSearchResults(
  chapter: Pick<StoredChapterRecord, "volume" | "book" | "chapter" | "reference" | "volumeTitle" | "bookTitle" | "verses">,
  source: "indexeddb" | "bundle",
  version: string,
  limit: number
) {
  return chapter.verses.slice(0, limit).map((verse) =>
    toSearchResult(
      {
        volume: chapter.volume,
        book: chapter.book,
        chapter: chapter.chapter,
        verse: verse.verse,
        reference: `${chapter.reference}:${verse.verse}`,
        volumeTitle: chapter.volumeTitle,
        bookTitle: chapter.bookTitle,
        text: verse.text,
      },
      source,
      version
    )
  );
}

async function readBundledChapterRecord(volume: string, book: string, chapter: number) {
  const bundle = await getVolumeBundle(volume);
  const bookData = bundle.books.find((item) => item.book === book);
  const chapterData = bookData?.chapters.find((item) => item.chapter === chapter);
  if (!bookData || !chapterData) return null;

  return {
    volume,
    book,
    chapter,
    reference: makeReference(bookData.title, chapter),
    volumeTitle: bundle.volume.title,
    bookTitle: bookData.title,
    verses: chapterData.verses,
    version: bundle.version,
  };
}

async function readBundledVerseRecord(volume: string, book: string, chapter: number, verse: number) {
  const chapterRecord = await readBundledChapterRecord(volume, book, chapter);
  if (!chapterRecord) return null;
  const verseRecord = chapterRecord.verses.find((item) => item.verse === verse);
  if (!verseRecord) return null;
  return {
    volume,
    book,
    chapter,
    verse,
    reference: `${chapterRecord.reference}:${verse}`,
    volumeTitle: chapterRecord.volumeTitle,
    bookTitle: chapterRecord.bookTitle,
    text: verseRecord.text,
    version: chapterRecord.version,
  };
}

async function readBundledChapterByReferenceKey(referenceKey: string) {
  const manifest = await getManifest();
  for (const volumeInfo of manifest.volumes) {
    const bundle = await getVolumeBundle(volumeInfo.volume);
    for (const bookData of bundle.books) {
      for (const chapterData of bookData.chapters) {
        const reference = makeReference(bookData.title, chapterData.chapter);
        if (makeReferenceKey(reference) !== referenceKey) continue;
        return {
          volume: volumeInfo.volume,
          book: bookData.book,
          chapter: chapterData.chapter,
          reference,
          volumeTitle: volumeInfo.title,
          bookTitle: bookData.title,
          verses: chapterData.verses,
          version: bundle.version,
        };
      }
    }
  }
  return null;
}

async function searchBundledVerses(
  normalizedQuery: string,
  options: Required<Pick<ScriptureSearchOptions, "limit">> & Omit<ScriptureSearchOptions, "limit">
) {
  const manifest = await getManifest();
  const targetVolumes = options.volume
    ? manifest.volumes.filter((item) => item.volume === options.volume)
    : manifest.volumes;

  const matches: ScriptureSearchResult[] = [];
  for (const volumeInfo of targetVolumes) {
    const bundle = await getVolumeBundle(volumeInfo.volume);
    for (const bookData of bundle.books) {
      if (options.book && bookData.book !== options.book) continue;
      for (const chapterData of bookData.chapters) {
        for (const verse of chapterData.verses) {
          const reference = `${bookData.title} ${chapterData.chapter}`;
          const searchText = buildVerseSearchText({
            volumeTitle: volumeInfo.title,
            bookTitle: bookData.title,
            reference,
            verse: verse.verse,
            text: verse.text,
          });
          if (!searchText.includes(normalizedQuery)) continue;
          matches.push({
            volume: volumeInfo.volume,
            book: bookData.book,
            chapter: chapterData.chapter,
            verse: verse.verse,
            reference: `${reference}:${verse.verse}`,
            volumeTitle: volumeInfo.title,
            bookTitle: bookData.title,
            text: verse.text,
            source: "bundle",
            version: bundle.version,
          });
          if (matches.length >= options.limit) return matches;
        }
      }
    }
  }

  return matches;
}

export async function getBrowserScriptureStorageStatus(): Promise<ScriptureStorageStatus> {
  ensureBrowserEnvironment();
  const local = readLocalStatus();
  if (!supportsIndexedDb()) {
    const manifest = await getManifest();
    return toStatus("bundle", null, {
      state: local?.state ?? "bundle-only",
      version: local?.version ?? manifest.version,
      updatedAt: local?.updatedAt,
      progress: local?.progress,
      error: local?.error,
    });
  }

  try {
    const db = await openDatabase();
    const meta = await readMetaRecord(db);
    db.close();
    return toStatus("indexeddb", meta ?? null, local ?? undefined);
  } catch {
    const manifest = await getManifest();
    return toStatus("bundle", null, {
      state: "bundle-only",
      version: local?.version ?? manifest.version,
      updatedAt: local?.updatedAt,
      progress: local?.progress,
      error: local?.error,
    });
  }
}

export async function ensureBrowserScriptureStorage(
  options: EnsureStorageOptions = {}
): Promise<ScriptureStorageStatus> {
  ensureBrowserEnvironment();
  if (installPromise && !options.forceReload) return installPromise;

  installPromise = (async () => {
    const manifest = await getManifest();
    if (!supportsIndexedDb()) {
      const status = {
        supported: true,
        source: "bundle",
        state: "bundle-only",
        version: manifest.version,
        updatedAt: Date.now(),
      } satisfies ScriptureStorageStatus;
      writeLocalStatus(status);
      return status;
    }

    let db: IDBDatabase | null = null;
    try {
      db = await openDatabase();
      const currentMeta = await readMetaRecord(db);
      if (!options.forceReload && currentMeta?.state === "ready" && currentMeta.version === manifest.version) {
        const status = toStatus("indexeddb", currentMeta);
        writeLocalStatus(status);
        return status;
      }

      await clearDatasetStores(db);
      const progress = toProgress(manifest);
      const installingMeta: StoredMetaRecord["value"] = {
        state: "installing",
        version: manifest.version,
        updatedAt: Date.now(),
        progress: { ...progress },
      };
      await writeInstallStatus(db, "indexeddb", installingMeta);
      options.onProgress?.({ ...progress });

      for (const volumeInfo of manifest.volumes) {
        const bundle = await getVolumeBundle(volumeInfo.volume);
        await importBundleIntoDb(db, bundle, progress);
        const progressSnapshot = { ...progress };
        options.onProgress?.(progressSnapshot);
        await writeInstallStatus(db, "indexeddb", {
          state: "installing",
          version: manifest.version,
          updatedAt: Date.now(),
          progress: progressSnapshot,
        });
      }

      return await writeInstallStatus(db, "indexeddb", {
        state: "ready",
        version: manifest.version,
        updatedAt: Date.now(),
        progress: { ...progress },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown storage error";
      const fallback = await writeInstallStatus(db, "bundle", {
        state: "bundle-only",
        version: manifest.version,
        updatedAt: Date.now(),
        error: message,
      });
      return { ...fallback, source: "bundle" };
    } finally {
      db?.close();
      installPromise = null;
    }
  })();

  return installPromise;
}

export async function readBrowserScriptureChapter(
  volume: string,
  book: string,
  chapter: number
): Promise<BrowserScriptureChapter | null> {
  ensureBrowserEnvironment();
  const manifest = await getManifest();
  const targetChapter = Number(chapter);
  if (!Number.isFinite(targetChapter) || targetChapter <= 0) {
    throw new Error("Invalid chapter number");
  }

  if (supportsIndexedDb()) {
    try {
      const db = await openDatabase();
      const meta = await readMetaRecord(db);
      if (meta?.state === "ready" && meta.version === manifest.version) {
        const stored = await getStoredChapter(db, volume, book, targetChapter);
        db.close();
        if (stored) {
          return {
            ...stored,
            source: "indexeddb",
            version: manifest.version,
          };
        }
      } else {
        db.close();
      }
    } catch {
      // Fall through to bundled dataset.
    }
  }

  const bundled = await readBundledChapterRecord(volume, book, targetChapter);
  if (!bundled) return null;
  return { ...bundled, source: "bundle" };
}

export async function searchBrowserScriptures(
  query: string,
  options: ScriptureSearchOptions = {}
): Promise<ScriptureSearchResult[]> {
  ensureBrowserEnvironment();
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const manifest = await getManifest();
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));

  if (supportsIndexedDb()) {
    try {
      const db = await openDatabase();
      const meta = await readMetaRecord(db);
      if (meta?.state === "ready" && meta.version === manifest.version) {
        const stored = await searchStoredVerses(db, normalizedQuery, {
          ...options,
          limit,
        });
        db.close();
        return stored.map((item) => ({
          volume: item.volume,
          book: item.book,
          chapter: item.chapter,
          verse: item.verse,
          reference: item.reference,
          volumeTitle: item.volumeTitle,
          bookTitle: item.bookTitle,
          text: item.text,
          source: "indexeddb",
          version: manifest.version,
        }));
      }
      db.close();
    } catch {
      // Fall through to bundled dataset.
    }
  }

  return searchBundledVerses(normalizedQuery, { ...options, limit });
}

export async function resolveBrowserScriptureReference(
  query: string,
  options: ScriptureSearchOptions = {}
): Promise<ScriptureSearchResult[]> {
  ensureBrowserEnvironment();
  const references = parseScriptureReferenceQuery(query, options.limit ?? 12);
  if (references.length === 0) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const filteredReferences = references.filter((reference) => {
    if (options.volume && reference.volume !== options.volume) return false;
    if (options.book && reference.book !== options.book) return false;
    return true;
  });
  if (filteredReferences.length === 0) return [];

  const manifest = await getManifest();

  if (supportsIndexedDb()) {
    try {
      const db = await openDatabase();
      const meta = await readMetaRecord(db);
      if (meta?.state === "ready" && meta.version === manifest.version) {
        const matches: ScriptureSearchResult[] = [];
        for (const reference of filteredReferences) {
          if (reference.verse) {
            const storedVerse = await getStoredVerse(
              db,
              reference.volume,
              reference.book,
              reference.chapter,
              reference.verse
            );
            if (storedVerse) {
              matches.push(toSearchResult(storedVerse, "indexeddb", manifest.version));
            }
          } else {
            const storedChapter =
              (await getStoredChapter(db, reference.volume, reference.book, reference.chapter)) ??
              (await getStoredChapterByReferenceKey(db, makeReferenceKey(reference.label)));
            if (storedChapter) {
              matches.push(...toChapterSearchResults(storedChapter, "indexeddb", manifest.version, limit - matches.length));
            }
          }
          if (matches.length >= limit) break;
        }
        db.close();
        return matches.slice(0, limit);
      }
      db.close();
    } catch {
      // Fall through to bundled dataset.
    }
  }

  const bundleMatches: ScriptureSearchResult[] = [];
  for (const reference of filteredReferences) {
    if (reference.verse) {
      const verseRecord = await readBundledVerseRecord(
        reference.volume,
        reference.book,
        reference.chapter,
        reference.verse
      );
      if (verseRecord) {
        bundleMatches.push(toSearchResult(verseRecord, "bundle", verseRecord.version));
      }
    } else {
      const chapterRecord =
        (await readBundledChapterRecord(reference.volume, reference.book, reference.chapter)) ??
        (await readBundledChapterByReferenceKey(makeReferenceKey(reference.label)));
      if (chapterRecord) {
        bundleMatches.push(...toChapterSearchResults(chapterRecord, "bundle", chapterRecord.version, limit - bundleMatches.length));
      }
    }
    if (bundleMatches.length >= limit) break;
  }

  return bundleMatches.slice(0, limit);
}

export async function getBundledScriptureDatasetVersion() {
  ensureBrowserEnvironment();
  const manifest = await getManifest();
  return manifest.version;
}
