import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildScriptureCatalogFromDirectory, serializeScriptureCatalog } from "../../scripts/scriptureCatalog.mjs";
import { BIBLE_BOOKS } from "./bibleCanon.ts";
import {
  browseBookBackHref,
  browseBookEntryHref,
  browseBookHref,
  browseSelectionHref,
  browseVolumeHref,
  buildBookView,
  buildLibraryVolumes,
  buildChapterChrome,
  buildVolumeBooks,
  chapterChromeForHref,
  chapterNavigationTarget,
  chapterOverlayTranslations,
  describeChapterTarget,
  isBrowseSelectionHref,
  isPendingChapterVisible,
  isPlainLeftClick,
  parseBrowseChapterHref,
  parseBrowseSelection,
  singleChapterBookHref,
  toSearchSuffix,
} from "./browseRoutes.ts";
import {
  chapterRequestKey,
  createChapterRequestCache,
  isSubstitutedTranslation,
  runIdleQueue,
} from "./chapterRequestCache.ts";
import {
  EMPTY_OVERLAY_STATE,
  overlayRequestKey,
  recordOverlayOutcome,
  summarizeOverlays,
} from "./comparisonOverlays.ts";
import { createLocalScriptureStore } from "./localScriptureStore.ts";
import { createScriptureCatalogIndex } from "./scriptureCatalogIndex.ts";
import { createServerChapterFetcher } from "./serverChapterFetcher.ts";
import { getScriptureBookArt } from "./scriptureBookArt.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = path.join(root, "public/scripture-data");
const catalogPath = path.join(root, "src/lib/generated/scriptureCatalog.json");
const rawCatalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const catalog = createScriptureCatalogIndex(rawCatalog);

test("every scripture book has local artwork matching its displayed section", () => {
  const { assets } = JSON.parse(fs.readFileSync(path.join(root, "docs/scripture-book-art-prompts.json"), "utf8"));
  const artByBook = new Map(assets.map((asset) => [`${asset.volume}:${asset.book}`, asset]));
  const images = new Set();
  for (const volume of catalog.volumes) {
    for (const book of buildVolumeBooks(catalog, volume.volume)) {
      const src = getScriptureBookArt(volume.volume, book.id);
      assert.ok(fs.existsSync(path.join(root, "public", src)), `Missing artwork for ${book.label}: ${src}`);
      images.add(src);
      if (volume.volume === "doctrineandcovenants") continue;
      const asset = artByBook.get(`${volume.volume}:${book.id}`);
      assert.ok(asset, `Missing provenance for ${book.label}`);
      assert.equal(asset.dest, `public${src}`);
      assert.equal(asset.section, book.category, `Section mismatch for ${book.label}`);
    }
  }
  assert.equal(images.size, 87);
  assert.equal(artByBook.size, 86);
  assert.equal(getScriptureBookArt("old-testament", "genesis"), getScriptureBookArt("oldtestament", "genesis"));
  assert.equal(getScriptureBookArt("dnc", "doctrineandcovenants"), "/art/browse-doctrineandcovenants.webp");
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// --- Catalog artifact ---------------------------------------------------------------------------------------

test("the committed catalog is exactly what the generator builds from the committed bundles", () => {
  const rebuilt = serializeScriptureCatalog(buildScriptureCatalogFromDirectory(dataDir));
  assert.equal(fs.readFileSync(catalogPath, "utf8"), rebuilt, "run `npm run generate:scriptures -- --catalog-only`");
});

test("the catalog is small and matches the bundle manifest's totals", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, "manifest.json"), "utf8"));
  assert.ok(fs.statSync(catalogPath).size < 40_000, "the catalog must stay a small navigation artifact");
  assert.equal(rawCatalog.version, manifest.version);
  for (const volume of manifest.volumes) {
    const entry = catalog.getVolume(volume.volume);
    assert.ok(entry, volume.volume);
    assert.equal(entry.books.length, volume.bookCount);
    assert.equal(entry.books.reduce((sum, book) => sum + book.chapterCount, 0), volume.chapterCount);
    assert.equal(
      entry.books.reduce((sum, book) => sum + book.verseCounts.reduce((total, count) => total + count, 0), 0),
      volume.verseCount
    );
  }
});

test("catalog Bible books use the app's slugs, labels, and chapter counts", () => {
  for (const bibleBook of BIBLE_BOOKS) {
    const volume = bibleBook.testament === "old" ? "oldtestament" : "newtestament";
    const entry = catalog.getBook(volume, bibleBook.slug);
    assert.ok(entry, bibleBook.slug);
    assert.equal(entry.label, bibleBook.label);
    assert.equal(entry.chapterCount, bibleBook.chapters);
    assert.equal(entry.verseCounts.length, bibleBook.chapters);
  }
});

test("catalog index: Library order, lookups, labels, and chapter bounds", () => {
  assert.deepEqual(
    catalog.volumes.map((volume) => volume.volume),
    ["bookofmormon", "oldtestament", "newtestament", "doctrineandcovenants", "pearl"]
  );
  assert.deepEqual(
    catalog.datasetVolumes.map((volume) => volume.volume),
    ["oldtestament", "newtestament", "bookofmormon", "doctrineandcovenants", "pearl"]
  );
  assert.equal(catalog.getBook("pearl", "josephsmithmatthew").label, "Joseph Smith-Matthew");
  assert.equal(catalog.getBook("doctrineandcovenants", "doctrineandcovenants").chapterDelineation, "Section");
  assert.equal(catalog.getBook("bookofmormon", "alma").chapterDelineation, "Chapter");
  assert.equal(catalog.findBook("alma").volume, "bookofmormon");
  assert.equal(catalog.getBook("bookofmormon", "genesis"), null);
  assert.equal(catalog.hasChapter("bookofmormon", "alma", 63), true);
  assert.equal(catalog.hasChapter("bookofmormon", "alma", 64), false);
  assert.equal(catalog.hasChapter("bookofmormon", "alma", 0), false);
  assert.equal(catalog.hasChapter("bookofmormon", "alma", Number.NaN), false);
});

// --- Server-side local store --------------------------------------------------------------------------------

function stubStore() {
  const reads = [];
  const store = createLocalScriptureStore(
    catalog,
    async (volume) => {
      reads.push(volume.volume);
      await flush();
      return JSON.parse(fs.readFileSync(path.join(dataDir, path.basename(volume.bundlePath)), "utf8"));
    },
    (volume) => (volume === "oldtestament" || volume === "newtestament" ? "lds" : undefined)
  );
  return { store, reads };
}

test("chapter misses the catalog rules out never read a verse bundle", async () => {
  const { store, reads } = stubStore();
  assert.equal(await store.getChapter("bookofmormon", "alma", 99), null);
  assert.equal(await store.getChapter("bookofmormon", "notabook", 1), null);
  assert.equal(await store.getChapter("dnc", "doctrineandcovenants", 1), null, "volumes are canonical ids");
  assert.deepEqual(reads, []);
});

test("a chapter read loads only its own volume, once, even for concurrent reads", async () => {
  const { store, reads } = stubStore();
  const [first, second, other] = await Promise.all([
    store.getChapter("bookofmormon", "alma", 32),
    store.getChapter("bookofmormon", "alma", 32),
    store.getChapter("bookofmormon", "moroni", 10),
  ]);
  assert.deepEqual(reads, ["bookofmormon"]);
  assert.equal(first.reference, "Alma 32");
  assert.equal(first.translation, undefined);
  assert.equal(first.verses.length, catalog.getBook("bookofmormon", "alma").verseCounts[31]);
  assert.deepEqual(second, first);
  assert.equal(other.reference, "Moroni 10");

  const genesis = await store.getChapter("oldtestament", "genesis", 1);
  assert.equal(genesis.translation, "lds");
  assert.deepEqual(reads, ["bookofmormon", "oldtestament"]);
  assert.deepEqual(store.loadedVolumes().sort(), ["bookofmormon", "oldtestament"]);
});

test("a failed volume read is retried by the next request", async () => {
  let attempts = 0;
  const store = createLocalScriptureStore(catalog, async (volume) => {
    attempts += 1;
    if (attempts === 1) throw new Error("disk busy");
    return JSON.parse(fs.readFileSync(path.join(dataDir, path.basename(volume.bundlePath)), "utf8"));
  });
  await assert.rejects(store.getChapter("pearl", "moses", 1), /disk busy/);
  await flush();
  assert.equal((await store.getChapter("pearl", "moses", 1)).reference, "Moses 1");
  assert.equal(attempts, 2);
});

// --- Browse routes ------------------------------------------------------------------------------------------

test("selection URLs map to library, volume, and book views; chapters are not selection views", () => {
  assert.deepEqual(parseBrowseSelection("/browse"), { kind: "library" });
  assert.deepEqual(parseBrowseSelection("/browse/"), { kind: "library" });
  assert.deepEqual(parseBrowseSelection("/browse/bookofmormon"), {
    kind: "volume",
    volume: "bookofmormon",
    volumeSlug: "bookofmormon",
  });
  assert.deepEqual(parseBrowseSelection("/browse/old-testament"), {
    kind: "volume",
    volume: "oldtestament",
    volumeSlug: "oldtestament",
  });
  assert.deepEqual(parseBrowseSelection("/browse/bookofmormon/alma?x=1"), {
    kind: "book",
    volume: "bookofmormon",
    volumeSlug: "bookofmormon",
    book: "alma",
  });
  assert.equal(parseBrowseSelection("/browse/bookofmormon/alma/32"), null);
  assert.equal(parseBrowseSelection("/plans"), null);
});

test("D&C keeps its one-book redirect semantics: the volume URL is the book view", () => {
  const expected = { kind: "book", volume: "doctrineandcovenants", volumeSlug: "dnc", book: "doctrineandcovenants" };
  assert.deepEqual(parseBrowseSelection("/browse/dnc"), expected);
  assert.deepEqual(parseBrowseSelection("/browse/doctrineandcovenants"), expected);
  assert.deepEqual(parseBrowseSelection("/browse/dnc/doctrineandcovenants"), expected);
  assert.equal(browseVolumeHref("doctrineandcovenants"), "/browse/dnc/doctrineandcovenants");
  assert.equal(browseSelectionHref(parseBrowseSelection("/browse/doctrineandcovenants")), "/browse/dnc/doctrineandcovenants");
  // Back from the D&C book goes to the Library, not to the volume URL that would redirect straight back.
  assert.equal(browseBookBackHref("doctrineandcovenants"), "/browse");
  assert.equal(browseBookBackHref("bookofmormon"), "/browse/bookofmormon");
});

test("canonical hrefs round-trip through the parser", () => {
  for (const href of ["/browse", "/browse/oldtestament", "/browse/pearl/moses", "/browse/dnc/doctrineandcovenants"]) {
    assert.equal(browseSelectionHref(parseBrowseSelection(href)), href);
  }
  assert.equal(browseBookHref("doctrineandcovenants", "doctrineandcovenants"), "/browse/dnc/doctrineandcovenants");
});

test("only plain left clicks are handled in place", () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
  assert.equal(isPlainLeftClick(click), true);
  assert.equal(isPlainLeftClick(click, "_self"), true);
  assert.equal(isPlainLeftClick(click, "_blank"), false);
  assert.equal(isPlainLeftClick({ ...click, metaKey: true }), false);
  assert.equal(isPlainLeftClick({ ...click, ctrlKey: true }), false);
  assert.equal(isPlainLeftClick({ ...click, shiftKey: true }), false);
  assert.equal(isPlainLeftClick({ ...click, button: 1 }), false);
  assert.equal(isPlainLeftClick({ ...click, defaultPrevented: true }), false);
});

test("view data comes from the catalog alone", () => {
  const library = buildLibraryVolumes(catalog);
  assert.deepEqual(
    library.map((volume) => [volume.id, volume.href, volume.shortLabel]),
    [
      ["bookofmormon", "/browse/bookofmormon", "15 books"],
      ["oldtestament", "/browse/oldtestament", "39 books"],
      ["newtestament", "/browse/newtestament", "27 books"],
      ["doctrineandcovenants", "/browse/dnc/doctrineandcovenants", "138 sections"],
      ["pearl", "/browse/pearl", "5 books"],
    ]
  );

  const oldTestament = buildVolumeBooks(catalog, "oldtestament");
  assert.equal(oldTestament.length, 39);
  assert.deepEqual(oldTestament[0], {
    id: "genesis",
    label: "Genesis",
    chapters: 50,
    category: "Law",
    subtitle: null,
    titleOfficial: "The First Book of Moses called Genesis",
    href: "/browse/oldtestament/genesis",
  });
  assert.equal(oldTestament.find((book) => book.id === "psalms").category, "Wisdom");
  assert.equal(buildVolumeBooks(catalog, "bookofmormon")[0].category, "Small Plates");
  assert.deepEqual(buildVolumeBooks(catalog, "nonsense"), []);

  assert.deepEqual(buildBookView(catalog, "doctrineandcovenants", "doctrineandcovenants"), {
    volume: "doctrineandcovenants",
    volumeSlug: "dnc",
    book: "doctrineandcovenants",
    label: "Doctrine and Covenants",
    chapterCount: 138,
    delineation: "Section",
    compact: true,
    backHref: "/browse",
  });
  assert.equal(buildBookView(catalog, "bookofmormon", "alma").compact, false);
  assert.equal(buildBookView(catalog, "bookofmormon", "genesis"), null);
});

// --- One-chapter books and chapter navigation ---------------------------------------------------------------

test("a one-chapter book opens straight to its chapter; every other book (and D&C) keeps its chapter list", () => {
  const singleChapterBooks = catalog.volumes.flatMap((volume) =>
    volume.books.filter((book) => book.chapterCount === 1).map((book) => `${volume.volume}:${book.book}`)
  );
  for (const key of ["bookofmormon:enos", "bookofmormon:jarom", "bookofmormon:omni", "bookofmormon:wordsofmormon"]) {
    assert.ok(singleChapterBooks.includes(key), key);
  }
  for (const key of ["bookofmormon:4nephi", "newtestament:jude", "pearl:josephsmithhistory", "oldtestament:obadiah"]) {
    assert.ok(singleChapterBooks.includes(key), key);
  }

  for (const volume of catalog.volumes) {
    const items = buildVolumeBooks(catalog, volume.volume);
    for (const book of volume.books) {
      const item = items.find((entry) => entry.id === book.book);
      const expected =
        book.chapterCount === 1
          ? `${browseBookHref(volume.volume, book.book)}/1`
          : browseBookHref(volume.volume, book.book);
      assert.equal(item.href, expected, `${volume.volume}:${book.book}`);
      // A list link is either another selection view (shown in place) or a chapter (through the router), never
      // a one-chapter book's list.
      assert.equal(isBrowseSelectionHref(item.href), book.chapterCount !== 1, item.href);
    }
  }

  assert.equal(singleChapterBookHref(catalog, "bookofmormon", "enos"), "/browse/bookofmormon/enos/1");
  assert.equal(singleChapterBookHref(catalog, "newtestament", "jude"), "/browse/newtestament/jude/1");
  assert.equal(singleChapterBookHref(catalog, "pearl", "josephsmithhistory"), "/browse/pearl/josephsmithhistory/1");
  // Volume aliases land on the canonical chapter URL in one step.
  assert.equal(singleChapterBookHref(catalog, "new-testament", "jude"), "/browse/newtestament/jude/1");
  assert.equal(singleChapterBookHref(catalog, "dnc", "doctrineandcovenants"), null);
  assert.equal(singleChapterBookHref(catalog, "doctrineandcovenants", "doctrineandcovenants"), null);
  assert.equal(singleChapterBookHref(catalog, "bookofmormon", "alma"), null);
  assert.equal(singleChapterBookHref(catalog, "bookofmormon", "not-a-book"), null);
  assert.equal(singleChapterBookHref(catalog, "oldtestament", "enos"), null);
  assert.equal(browseBookEntryHref(catalog, "bookofmormon", "alma"), "/browse/bookofmormon/alma");
  assert.equal(browseBookEntryHref(catalog, "old-testament", "obadiah"), "/browse/oldtestament/obadiah/1");
  assert.equal(buildBookView(catalog, "doctrineandcovenants", "doctrineandcovenants").chapterCount, 138);
});

test("a one-chapter book redirect keeps the page's query, in order", () => {
  assert.equal(toSearchSuffix({}), "");
  assert.equal(toSearchSuffix({ translation: undefined }), "");
  assert.equal(toSearchSuffix({ translation: "kjv", compare: ["nrsv", "esv"] }), "?translation=kjv&compare=nrsv&compare=esv");
  assert.equal(toSearchSuffix({ q: "a b&c" }), "?q=a+b%26c");
});

test("only selection views are shown in place by the selector; chapters always go through the router", () => {
  for (const href of ["/browse", "/browse/oldtestament", "/browse/bookofmormon/alma", "/browse/dnc", "/browse?x=1"]) {
    assert.equal(isBrowseSelectionHref(href), true, href);
  }
  for (const href of [
    "/browse/bookofmormon/enos/1",
    "/browse/bookofmormon/alma/32#v-21",
    "/browse/oldtestament/genesis/1?translation=kjv",
    "/browsex",
    "/search",
    "https://example.com/browse",
  ]) {
    assert.equal(isBrowseSelectionHref(href), false, href);
  }
});

test("chapter hrefs parse to their canonical chapter, ignoring query and fragment", () => {
  assert.deepEqual(parseBrowseChapterHref("/browse/old-testament/genesis/3?translation=kjv#v-2"), {
    volume: "oldtestament",
    volumeSlug: "oldtestament",
    book: "genesis",
    chapter: 3,
    pathname: "/browse/old-testament/genesis/3",
  });
  assert.equal(parseBrowseChapterHref("/browse/bookofmormon/enos"), null);
  assert.equal(parseBrowseChapterHref("/browse/bookofmormon/enos/0"), null);
  assert.equal(parseBrowseChapterHref("/browse/bookofmormon/enos/one"), null);
  assert.equal(parseBrowseChapterHref("/browse/bookofmormon/enos/1/extra"), null);
  assert.equal(parseBrowseChapterHref("https://example.com/browse/bookofmormon/enos/1"), null);
  assert.equal(parseBrowseChapterHref("/plans"), null);
});

test("the page is shown ahead of its route only for navigations to another chapter, never for verse jumps on the current one", () => {
  const alma32 = "/browse/bookofmormon/alma/32";
  assert.equal(chapterNavigationTarget(alma32, `${alma32}#v-21`), null);
  assert.equal(chapterNavigationTarget(alma32, `${alma32}?translation=kjv`), null);
  assert.equal(chapterNavigationTarget(`${alma32}?x=1#v-3`, alma32), null);
  assert.equal(chapterNavigationTarget(alma32, "/browse/bookofmormon/alma"), null);
  assert.equal(chapterNavigationTarget(alma32, "/plans"), null);
  assert.equal(chapterNavigationTarget(alma32, "/browse/bookofmormon/alma/33").chapter, 33);
  assert.equal(chapterNavigationTarget("/browse/bookofmormon", "/browse/bookofmormon/enos/1#v-3").book, "enos");
  assert.equal(chapterNavigationTarget("/browse/bookofmormon/alma", "/browse/bookofmormon/alma/1").chapter, 1);
});

test("a chapter ahead of its route is titled with the chapter it opens", () => {
  const label = (href) => describeChapterTarget(catalog, parseBrowseChapterHref(href));
  assert.equal(label("/browse/bookofmormon/enos/1"), "Enos 1");
  assert.equal(label("/browse/newtestament/jude/1"), "Jude 1");
  assert.equal(label("/browse/bookofmormon/alma/32?translation=kjv"), "Alma 32");
  assert.equal(label("/browse/dnc/doctrineandcovenants/76"), "Doctrine and Covenants 76");
  assert.equal(label("/browse/pearl/josephsmithhistory/1"), `${catalog.getBook("pearl", "josephsmithhistory").label} 1`);
  assert.equal(label("/browse/bookofmormon/made-up-book/2"), "made up book 2");
});

test("the chapter shown ahead of its route shows only while its navigation is in flight from the page it started on", () => {
  const pending = {
    fromPathname: "/browse/bookofmormon/alma",
    href: "/browse/bookofmormon/alma/32",
    target: parseBrowseChapterHref("/browse/bookofmormon/alma/32"),
  };
  // Started: the old page is still current while the router fetches.
  assert.equal(isPendingChapterVisible(pending, { pathname: "/browse/bookofmormon/alma", navigating: true }), true);
  // Arrived (or the route's own loading boundary took over).
  assert.equal(isPendingChapterVisible(pending, { pathname: "/browse/bookofmormon/alma/32", navigating: true }), false);
  assert.equal(isPendingChapterVisible(pending, { pathname: "/browse/bookofmormon/alma/32", navigating: false }), false);
  // Back/Forward or another navigation moved off the starting page before the chapter came.
  assert.equal(isPendingChapterVisible(pending, { pathname: "/browse/bookofmormon", navigating: true }), false);
  // The navigation ended without leaving (failed or superseded): the page comes back.
  assert.equal(isPendingChapterVisible(pending, { pathname: "/browse/bookofmormon/alma", navigating: false }), false);
  assert.equal(isPendingChapterVisible(null, { pathname: "/browse/bookofmormon/alma", navigating: true }), false);
});

test("a chapter's page chrome comes from the URL and catalog alone, the same before and after its text arrives", () => {
  const alma32 = buildChapterChrome(catalog, { volume: "bookofmormon", book: "alma", chapter: 32 });
  assert.equal(alma32.reference, "Alma 32");
  assert.equal(alma32.pathname, "/browse/bookofmormon/alma/32");
  assert.equal(alma32.catalogued, true);
  assert.deepEqual(alma32.breadcrumbs, [
    { label: "Browse", href: "/browse" },
    { label: "Book of Mormon", href: "/browse/bookofmormon" },
    { label: "Alma", href: "/browse/bookofmormon/alma" },
    { label: "Chapter 32" },
  ]);
  assert.equal(alma32.prevHref, "/browse/bookofmormon/alma/31");
  assert.equal(alma32.nextHref, "/browse/bookofmormon/alma/33");
  assert.equal(buildChapterChrome(catalog, { volume: "bookofmormon", book: "alma", chapter: 1 }).prevHref, undefined);
  assert.equal(buildChapterChrome(catalog, { volume: "bookofmormon", book: "alma", chapter: 63 }).nextHref, undefined);

  // The bundled text's reference is the catalog label and chapter, so the title never changes when it arrives.
  const enos = buildChapterChrome(catalog, { volume: "bookofmormon", book: "enos", chapter: 1 });
  assert.equal(enos.reference, describeChapterTarget(catalog, { volume: "bookofmormon", book: "enos", chapter: 1 }));
  // A one-chapter book has no crumb (its URL opens this chapter) and nothing either side.
  assert.deepEqual(enos.breadcrumbs.map((crumb) => crumb.label), ["Browse", "Book of Mormon", "Chapter 1"]);
  assert.equal(enos.prevHref, undefined);
  assert.equal(enos.nextHref, undefined);

  // D&C's one book is its volume: no repeated crumb, and the short volume slug.
  const dc76 = buildChapterChrome(catalog, { volume: "dnc", book: "doctrineandcovenants", chapter: 76 });
  assert.equal(dc76.volume, "doctrineandcovenants");
  assert.deepEqual(dc76.breadcrumbs.map((crumb) => crumb.href ?? null), ["/browse", "/browse/dnc/doctrineandcovenants", null]);
  assert.equal(dc76.nextHref, "/browse/dnc/doctrineandcovenants/77");

  // A book the catalog lacks still gets a page; its reference is a guess the text may correct.
  const unknown = buildChapterChrome(catalog, { volume: "bookofmormon", book: "made-up-book", chapter: 2 });
  assert.equal(unknown.catalogued, false);
  assert.equal(unknown.reference, "made up book 2");
  assert.equal(unknown.nextHref, "/browse/bookofmormon/made-up-book/3");
});

test("comparison translations carry over to a chapter's neighbours, for the Bible only", () => {
  assert.deepEqual(chapterOverlayTranslations("oldtestament", { translation: "KJV", compare: ["lds", "web", "kjv"] }), ["kjv", "web"]);
  assert.deepEqual(chapterOverlayTranslations("new-testament", { translation: ["web", "asv"], compare: "kjv" }), ["web", "kjv"]);
  assert.deepEqual(chapterOverlayTranslations("bookofmormon", { translation: "kjv" }), []);
  assert.deepEqual(chapterOverlayTranslations("oldtestament", {}), []);

  const genesis3 = chapterChromeForHref(catalog, "/browse/old-testament/genesis/3?translation=KJV&compare=web#v-2");
  assert.equal(genesis3.pathname, "/browse/oldtestament/genesis/3");
  assert.equal(genesis3.prevHref, "/browse/oldtestament/genesis/2?translation=kjv&compare=web");
  assert.equal(genesis3.nextHref, "/browse/oldtestament/genesis/4?translation=kjv&compare=web");
  assert.equal(chapterChromeForHref(catalog, "/browse/bookofmormon/alma/32?translation=kjv").nextHref, "/browse/bookofmormon/alma/33");
  assert.equal(chapterChromeForHref(catalog, "/browse/bookofmormon/alma"), null);
  assert.equal(chapterChromeForHref(catalog, "/plans"), null);
});

// --- Shared chapter request cache ---------------------------------------------------------------------------

test("concurrent and repeat loads of one chapter share a single request", async () => {
  const calls = [];
  const gate = deferred();
  const cache = createChapterRequestCache(async (request) => {
    calls.push(chapterRequestKey(request));
    await gate.promise;
    return { reference: `${request.book} ${request.chapter}`, translation: request.translation };
  });

  const preview = cache.load({ volume: "oldtestament", book: "genesis", chapter: 2 });
  const prefetch = cache.load({ volume: "oldtestament", book: "genesis", chapter: 2, translation: "lds" });
  const overlayA = cache.load({ volume: "oldtestament", book: "genesis", chapter: 2, translation: "KJV" });
  const overlayB = cache.load({ volume: "oldtestament", book: "genesis", chapter: 2, translation: "kjv" });
  assert.equal(preview, prefetch, "the bundled text is one entry whether or not 'lds' is named");
  assert.equal(overlayA, overlayB, "translation ids fold case for sharing");
  assert.equal(cache.peek({ volume: "oldtestament", book: "genesis", chapter: 2 }), undefined, "peek never waits");

  gate.resolve();
  await Promise.all([preview, overlayA]);
  assert.deepEqual(calls, ["oldtestament/genesis/2", "oldtestament/genesis/2?t=kjv"]);
  await cache.load({ volume: "oldtestament", book: "genesis", chapter: 2 });
  assert.equal(calls.length, 2, "a settled chapter is served from memory");
  assert.equal(cache.peek({ volume: "oldtestament", book: "genesis", chapter: 2 }).reference, "genesis 2");
});

test("a failed load is not cached, so the next request retries", async () => {
  let attempts = 0;
  const cache = createChapterRequestCache(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("offline");
    return "ok";
  });
  const request = { volume: "newtestament", book: "john", chapter: 3, translation: "web" };
  await assert.rejects(cache.load(request), /offline/);
  assert.equal(cache.size(), 0);
  assert.equal(await cache.load(request), "ok");
  assert.equal(attempts, 2);
});

test("the cache is bounded and never evicts an in-flight request", async () => {
  const gates = new Map();
  const cache = createChapterRequestCache(
    (request) => {
      const gate = deferred();
      gates.set(request.chapter, gate);
      return gate.promise;
    },
    { maxEntries: 2 }
  );
  const pending = cache.load({ volume: "v", book: "b", chapter: 1 });
  cache.load({ volume: "v", book: "b", chapter: 2 });
  cache.load({ volume: "v", book: "b", chapter: 3 });
  await flush();
  assert.equal(cache.size(), 3, "all three are in flight");
  gates.get(2).resolve("two");
  gates.get(3).resolve("three");
  await flush();
  assert.equal(cache.size(), 2, "settled entries are evicted down to the bound");
  assert.equal(cache.load({ volume: "v", book: "b", chapter: 1 }), pending, "the in-flight entry is still shared");
  gates.get(1).resolve("one");
  assert.equal(await pending, "one");
});

test("prime records a known chapter without a load", async () => {
  let calls = 0;
  const cache = createChapterRequestCache(async () => {
    calls += 1;
    return "loaded";
  });
  cache.prime({ volume: "v", book: "b", chapter: 1 }, "primed");
  assert.equal(await cache.load({ volume: "v", book: "b", chapter: 1 }), "primed");
  assert.equal(calls, 0);
});

test("a substituted translation is one whose answer names a different text", () => {
  assert.equal(isSubstitutedTranslation("kjv", "lds"), true);
  assert.equal(isSubstitutedTranslation("BSB", "kjv"), true);
  assert.equal(isSubstitutedTranslation("kjv", undefined), true);
  assert.equal(isSubstitutedTranslation("KJV", "kjv"), false, "case is not a substitution");
  assert.equal(isSubstitutedTranslation(" bsb ", "BSB"), false);
  assert.equal(isSubstitutedTranslation(undefined, "lds"), false, "the bundled text is never substituted");
  assert.equal(isSubstitutedTranslation("lds", "lds"), false);
  assert.equal(isSubstitutedTranslation("", undefined), false);
});

function createOverlayCache(loader) {
  return createChapterRequestCache(loader, {
    retain: (request, value) => !isSubstitutedTranslation(request.translation, value.translation),
  });
}

test("a fallback answer reaches every caller sharing the request, but the next load retries", async () => {
  const answers = [deferred(), deferred()];
  let calls = 0;
  const cache = createOverlayCache(() => answers[calls++].promise);
  const request = { volume: "oldtestament", book: "genesis", chapter: 1, translation: "kjv" };

  const first = cache.load(request);
  const shared = cache.load(request);
  assert.equal(first, shared, "callers during the request share it");
  await flush();
  answers[0].resolve({ reference: "Genesis 1", translation: "lds", verses: [] });
  assert.equal((await first).translation, "lds", "the fallback is still delivered, so the notice shows");
  assert.equal((await shared).translation, "lds");
  assert.equal(calls, 1);
  assert.equal(cache.peek(request), undefined, "the fallback is not kept as the requested translation");
  assert.equal(cache.size(), 0);

  const retry = cache.load(request);
  await flush();
  assert.equal(calls, 2, "the next load asks again once upstream may have recovered");
  answers[1].resolve({ reference: "Genesis 1", translation: "kjv", verses: [] });
  assert.equal((await retry).translation, "kjv");
  assert.equal(cache.peek(request).translation, "kjv", "the real translation is kept");
  await cache.load(request);
  assert.equal(calls, 2, "and served from memory afterwards");
});

test("the base text is retained under the retain rule", async () => {
  let calls = 0;
  const cache = createOverlayCache(async () => {
    calls += 1;
    return { reference: "Genesis 1", translation: "lds", verses: [] };
  });
  const request = { volume: "oldtestament", book: "genesis", chapter: 1 };
  await cache.load(request);
  await cache.load(request);
  assert.equal(calls, 1);
  cache.prime({ ...request, translation: "web" }, { reference: "Genesis 1", translation: "lds", verses: [] });
  assert.equal(cache.peek({ ...request, translation: "web" }), undefined, "a fallback cannot be primed either");
});

// --- Server chapter facade ----------------------------------------------------------------------------------

test("server chapter reads canonicalize volume aliases before the local and remote loaders", async () => {
  const calls = [];
  const loadLocal = async () => null;
  const fetchOnServer = createServerChapterFetcher(async (volume, book, chapter, options) => {
    calls.push({ volume, book, chapter, translation: options?.translation, local: options?.loadLocalChapter });
    return { reference: "", verses: [] };
  }, loadLocal);

  await fetchOnServer("dnc", "doctrineandcovenants", 4);
  await fetchOnServer("old-testament", "genesis", 1, { translation: "kjv" });
  await fetchOnServer("new-testament", "john", 1);
  await fetchOnServer("bookofmormon", "alma", 32);
  assert.deepEqual(
    calls.map(({ volume, translation }) => [volume, translation]),
    [
      ["doctrineandcovenants", undefined],
      ["oldtestament", "kjv"],
      ["newtestament", undefined],
      ["bookofmormon", undefined],
    ]
  );
  assert.ok(calls.every((call) => call.local === loadLocal), "every read is offered the bundled text first");
  assert.ok(catalog.hasChapter("doctrineandcovenants", "doctrineandcovenants", 4));
  assert.ok(!catalog.hasChapter("dnc", "doctrineandcovenants", 4), "the alias alone would miss the bundle");
});

test("idle prefetch runs one task per idle slot and stops when cancelled", async () => {
  const slots = [];
  const schedule = (callback) => {
    const slot = { callback, cancelled: false };
    slots.push(slot);
    return () => {
      slot.cancelled = true;
    };
  };
  const ran = [];
  const cancel = runIdleQueue(
    [
      () => ran.push("next route"),
      () => {
        ran.push("failing overlay");
        throw new Error("best effort");
      },
      () => ran.push("previous route"),
    ],
    schedule
  );

  assert.equal(slots.length, 1, "nothing runs until the browser is idle");
  slots[0].callback();
  await flush();
  assert.deepEqual(ran, ["next route"]);
  slots[1].callback();
  await flush();
  assert.deepEqual(ran, ["next route", "failing overlay"], "a failure does not stop the queue");
  assert.equal(slots.length, 3);

  cancel();
  assert.equal(slots[2].cancelled, true, "leaving the chapter cancels the pending idle slot");
  slots[2].callback();
  await flush();
  assert.deepEqual(ran, ["next route", "failing overlay"]);
});

// --- Comparison overlays ------------------------------------------------------------------------------------

const kjvJohn3 = { translation: "kjv", verses: [{ verse: 16, text: "For God so loved the world" }] };

test("overlays settle independently and in the requested order", () => {
  const key = overlayRequestKey("newtestament", "john", 3, ["kjv", "web"]);
  let state = EMPTY_OVERLAY_STATE;
  assert.deepEqual(summarizeOverlays(["kjv", "web"], state, key).pendingTranslations, ["kjv", "web"]);

  state = recordOverlayOutcome(state, key, 1, { status: "failed" });
  let summary = summarizeOverlays(["kjv", "web"], state, key);
  assert.deepEqual(summary.pendingTranslations, ["kjv"], "a failing overlay does not wait for the slow one");
  assert.deepEqual(summary.translationNotices, ['Could not load overlay translation "WEB".']);

  state = recordOverlayOutcome(state, key, 0, { status: "ready", chapter: kjvJohn3 });
  summary = summarizeOverlays(["kjv", "web"], state, key);
  assert.deepEqual(summary.pendingTranslations, []);
  assert.deepEqual(summary.compareChapters, [{ translation: "kjv", verses: kjvJohn3.verses }]);
});

test("a substituted overlay keeps the server's notice", () => {
  const key = overlayRequestKey("oldtestament", "genesis", 1, ["BSB"]);
  const state = recordOverlayOutcome(EMPTY_OVERLAY_STATE, key, 0, {
    status: "ready",
    chapter: { translation: "lds", verses: [] },
  });
  assert.deepEqual(summarizeOverlays(["BSB"], state, key).translationNotices, [
    'Overlay translation "BSB" was unavailable, showing "LDS" instead.',
  ]);
});

test("overlays from a previous chapter or translation set are never shown", () => {
  const john3 = overlayRequestKey("newtestament", "john", 3, ["kjv"]);
  const john4 = overlayRequestKey("newtestament", "john", 4, ["kjv"]);
  const john3Web = overlayRequestKey("newtestament", "john", 3, ["web"]);
  const state = recordOverlayOutcome(EMPTY_OVERLAY_STATE, john3, 0, { status: "ready", chapter: kjvJohn3 });

  const afterNavigation = summarizeOverlays(["kjv"], state, john4);
  assert.deepEqual(afterNavigation.compareChapters, []);
  assert.deepEqual(afterNavigation.pendingTranslations, ["kjv"]);
  assert.deepEqual(summarizeOverlays(["web"], state, john3Web).compareChapters, []);

  // Even if a late John 3 answer were recorded after moving on, John 4 would not show John 3's text.
  const john4State = recordOverlayOutcome(EMPTY_OVERLAY_STATE, john4, 0, { status: "failed" });
  const late = recordOverlayOutcome(john4State, john3, 0, { status: "ready", chapter: kjvJohn3 });
  assert.deepEqual(summarizeOverlays(["kjv"], late, john4).compareChapters, []);
});

test("a prefetched overlay is shown immediately from the cache", () => {
  const key = overlayRequestKey("newtestament", "john", 4, ["kjv"]);
  const summary = summarizeOverlays(["kjv"], EMPTY_OVERLAY_STATE, key, (translation) =>
    translation === "kjv" ? kjvJohn3 : undefined
  );
  assert.deepEqual(summary.pendingTranslations, []);
  assert.equal(summary.compareChapters.length, 1);
});
