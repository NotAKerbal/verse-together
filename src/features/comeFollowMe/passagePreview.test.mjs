import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findBook } from "../../lib/cfm/cfmScriptures.mjs";
import {
  chapterHref,
  chapterVerses,
  passageFromLink,
  passageTarget,
  passageTitle,
  PREVIEW_STATE_KEY,
  previewFromState,
  previewState,
  selectPassage,
} from "./passagePreview.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const isaiah = { slug: "isaiah", volume: "oldtestament" };
const bundle = (volume) => JSON.parse(fs.readFileSync(path.join(root, "public/scripture-data", `${volume}.json`), "utf8"));

test("the guide's own scripture link forms are passages: verses, ranges, and whole chapters", () => {
  assert.deepEqual(passageFromLink("/browse/newtestament/luke/4#v-16", "21"), {
    volume: "newtestament",
    book: "luke",
    label: "Luke",
    chapter: 4,
    first: 16,
    last: 21,
  });
  assert.deepEqual(passageFromLink("/browse/oldtestament/isaiah/66#v-24", null), {
    volume: "oldtestament",
    book: "isaiah",
    label: "Isaiah",
    chapter: 66,
    first: 24,
    last: 24,
  });
  assert.deepEqual(passageFromLink("/browse/oldtestament/isaiah/61", null), { volume: "oldtestament", book: "isaiah", label: "Isaiah", chapter: 61 });
  // The reader's short volume slug and its canonical id are the same volume.
  const dc = { volume: "doctrineandcovenants", book: "doctrineandcovenants", label: "Doctrine and Covenants", chapter: 19, first: 16, last: 19 };
  assert.deepEqual(passageFromLink("/browse/dnc/doctrineandcovenants/19#v-16", "19"), dc);
  assert.deepEqual(passageFromLink("/browse/doctrineandcovenants/doctrineandcovenants/19#v-16", "19"), dc);
  assert.deepEqual(passageFromLink("/browse/bookofmormon/mosiah/3#v-7", null), {
    volume: "bookofmormon",
    book: "mosiah",
    label: "Mosiah",
    chapter: 3,
    first: 7,
    last: 7,
  });
  // The older share-page form still reads, as the same passage.
  assert.deepEqual(passageFromLink("/share/oldtestament/isaiah/53/4-6", null), passageTarget("oldtestament", "isaiah", 53, 4, 6));
  // Scripture-pane anchors of the guide's own book (the closing sections have no pane beside them).
  assert.deepEqual(passageFromLink("#scripture-isaiah-58-v3-5", null, isaiah), passageTarget("oldtestament", "isaiah", 58, 3, 5));
  assert.deepEqual(passageFromLink("#scripture-isaiah-58", null, isaiah), passageTarget("oldtestament", "isaiah", 58));
});

test("anything else is an ordinary link, never a guessed passage", () => {
  const refused = [
    [null, null],
    ["", null],
    ["https://www.churchofjesuschrist.org/study/scriptures/ot/isa/58?lang=eng", null],
    ["https://example.com/browse/oldtestament/isaiah/58", null],
    ["//example.com/browse/oldtestament/isaiah/58", null],
    ["/browse/oldtestament/isaiah/58?verse=3", null],
    ["/browse/oldtestament/isaiah/58#v-3 ", null],
    ["/browse/oldtestament/isaiah", null],
    ["/browse/oldtestament/isaiah/67", null],
    ["/browse/oldtestament/isaiah/0", null],
    ["/browse/newtestament/isaiah/58", null],
    ["/browse/pearl/moses/7", null],
    ["/browse/oldtestament/notabook/1", null],
    ["/browse/oldtestament/isaiah/58#v-0", null],
    ["/browse/oldtestament/isaiah/58#v-200", null],
    ["/browse/oldtestament/isaiah/58#v-5", "3"],
    ["/browse/oldtestament/isaiah/58#v-5", "x"],
    ["/browse/oldtestament/isaiah/58#v-5", ""],
    ["/browse/oldtestament/isaiah/58", "3"],
    ["/share/oldtestament/isaiah/58", null],
    ["/share/oldtestament/isaiah/58/6-4", null],
    ["/share/oldtestament/isaiah/58/5", "7"],
    ["/come-follow-me/2026-10-12", null],
    ["#isaiah-53-4-the-great-reversal", null],
    ["#scripture-isaiah-58-v5-3", null],
    ["#scripture-isaiah-58-v3", "5"],
    ["#%", null],
  ];
  for (const [href, last] of refused) assert.equal(passageFromLink(href, last, isaiah), null, `${href} ${last}`);
  // Without the guide's book, a pane anchor names no book at all.
  assert.equal(passageFromLink("#scripture-isaiah-58-v3", null), null);
});

test("a passage is titled as printed and opens its full chapter in the reader at its first verse", () => {
  const luke = passageFromLink("/browse/newtestament/luke/4#v-16", "21");
  assert.equal(passageTitle(luke), "Luke 4:16–21");
  assert.equal(chapterHref(luke), "/browse/newtestament/luke/4#v-16");
  assert.equal(chapterHref(luke, false), "/browse/newtestament/luke/4");
  assert.equal(passageTitle(passageTarget("oldtestament", "isaiah", 66, 24)), "Isaiah 66:24");
  assert.equal(passageTitle(passageTarget("oldtestament", "isaiah", 61)), "Isaiah 61");
  assert.equal(chapterHref(passageTarget("oldtestament", "isaiah", 61)), "/browse/oldtestament/isaiah/61");
  const dc = passageTarget("doctrineandcovenants", "doctrineandcovenants", 19, 16, 19);
  assert.equal(passageTitle(dc), "Doctrine and Covenants 19:16–19");
  assert.equal(chapterHref(dc), "/browse/dnc/doctrineandcovenants/19#v-16");
});

test("a passage shows exactly its verses; a range past the chapter's end is refused, not clamped", () => {
  const source = bundle("oldtestament").books.find((book) => book.title === "Isaiah").chapters.find((chapter) => chapter.chapter === 58);
  // The lds-chapter API's answer for Isaiah 58, and the companion's own chapter (no reference), read alike.
  const verses = chapterVerses({ reference: "Isaiah 58", translation: "lds", verses: source.verses }, 58);
  assert.deepEqual(chapterVerses({ verses: source.verses }, 58), verses);
  assert.equal(verses.length, 14);
  const pick = (first, last) => selectPassage(passageTarget("oldtestament", "isaiah", 58, first, last), verses);
  assert.deepEqual(pick(3, 5).verses, source.verses.slice(2, 5).map(({ verse, text }) => ({ verse, text })));
  assert.deepEqual(
    pick(14).verses.map((verse) => verse.verse),
    [14]
  );
  assert.equal(pick().verses.length, 14);
  assert.deepEqual(pick(13, 20), { ok: false, count: 14 });
  assert.deepEqual(pick(15), { ok: false, count: 14 });
});

test("chapter data that might put the wrong words under a verse number is not shown", () => {
  const good = [
    { verse: 1, text: "One." },
    { verse: 2, text: "Two." },
  ];
  assert.deepEqual(chapterVerses({ verses: good }, 3), good);
  assert.equal(chapterVerses({ reference: "Isaiah 59", verses: good }, 58), null, "another chapter");
  assert.equal(chapterVerses({ reference: 58, verses: good }, 58), null);
  assert.equal(chapterVerses({ verses: [good[0], { verse: 3, text: "Three." }] }, 3), null, "a gap");
  assert.equal(chapterVerses({ verses: [good[1], good[0]] }, 3), null, "out of order");
  assert.equal(chapterVerses({ verses: [good[0], { verse: 2, text: "  " }] }, 3), null, "no text");
  assert.equal(chapterVerses({ verses: [good[0], { verse: "2", text: "Two." }] }, 3), null);
  assert.equal(chapterVerses({ verses: [] }, 3), null);
  assert.equal(chapterVerses({ error: "Chapter not found." }, 3), null);
  assert.equal(chapterVerses(null, 3), null);
});

test("every chapter of the local scripture a guide can link to reads as a passage", () => {
  let chapters = 0;
  for (const volume of ["oldtestament", "newtestament", "bookofmormon", "doctrineandcovenants"]) {
    for (const book of bundle(volume).books) {
      // Only books the guides' reference parser knows can be linked at all.
      if (!findBook(book.title)) continue;
      for (const chapter of book.chapters) {
        assert.ok(chapterVerses({ verses: chapter.verses }, chapter.chapter), `${volume} ${book.title} ${chapter.chapter}`);
        chapters += 1;
      }
    }
  }
  assert.ok(chapters > 1500, `${chapters} chapters`);
});

test("an open preview's history entry keeps the router's state and round-trips its passage", () => {
  // Next.js keeps its router state in history.state; an entry without __NA makes it reload the page on Back.
  const next = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ["", {}], renderedSearch: "" }, other: 1 };
  const luke = passageFromLink("/browse/newtestament/luke/4#v-16", "21");
  const state = previewState(next, luke);
  assert.equal(state.__NA, true);
  assert.equal(state.__PRIVATE_NEXTJS_INTERNALS_TREE, next.__PRIVATE_NEXTJS_INTERNALS_TREE);
  assert.equal(state.other, 1);
  assert.ok(!(PREVIEW_STATE_KEY in next), "the current state is not changed");
  assert.deepEqual(previewFromState(structuredClone(state)), luke);
  // Opening another preview over that entry replaces its passage; it never nests one.
  const chapter = passageTarget("oldtestament", "isaiah", 61);
  const again = previewState(state, chapter);
  assert.deepEqual(previewFromState(structuredClone(again)), chapter);
  assert.equal(again.__NA, true);
  assert.deepEqual(Object.keys(again).sort(), Object.keys(state).sort());
  assert.deepEqual(previewFromState(previewState(null, luke)), luke);
});

test("history entries without a preview, or with a damaged one, open nothing", () => {
  const base = { volume: "oldtestament", book: "isaiah", chapter: 58 };
  const entries = [
    null,
    undefined,
    0,
    "preview",
    {},
    { __NA: true },
    { [PREVIEW_STATE_KEY]: null },
    { [PREVIEW_STATE_KEY]: "isaiah 58" },
    { [PREVIEW_STATE_KEY]: { ...base, chapter: "58" } },
    { [PREVIEW_STATE_KEY]: { ...base, chapter: 67 } },
    { [PREVIEW_STATE_KEY]: { ...base, volume: "newtestament" } },
    { [PREVIEW_STATE_KEY]: { ...base, book: "notabook" } },
    { [PREVIEW_STATE_KEY]: { ...base, first: 5, last: 3 } },
    { [PREVIEW_STATE_KEY]: { ...base, first: "1" } },
    { [PREVIEW_STATE_KEY]: { ...base, last: 3 } },
  ];
  for (const entry of entries) assert.equal(previewFromState(entry), null, JSON.stringify(entry));
  assert.deepEqual(previewFromState({ [PREVIEW_STATE_KEY]: base }), passageTarget("oldtestament", "isaiah", 58));
});
