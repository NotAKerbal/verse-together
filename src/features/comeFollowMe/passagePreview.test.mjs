import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { exactReference, findBook } from "../../lib/cfm/cfmScriptures.mjs";
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
  // The local Pearl of Great Price, under its reader slugs.
  assert.deepEqual(passageFromLink("/browse/pearl/moses/7#v-18", null), {
    volume: "pearl",
    book: "moses",
    label: "Moses",
    chapter: 7,
    first: 18,
    last: 18,
  });
  assert.deepEqual(passageFromLink("/browse/pearl/josephsmithhistory/1#v-15", "20"), {
    volume: "pearl",
    book: "josephsmithhistory",
    label: "Joseph Smith—History",
    chapter: 1,
    first: 15,
    last: 20,
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
    ["https://www.churchofjesuschrist.org/study/scriptures/bd/isaiah?lang=eng", null],
    ["https://example.com/browse/oldtestament/isaiah/58", null],
    ["//example.com/browse/oldtestament/isaiah/58", null],
    ["/browse/oldtestament/isaiah/58?verse=3", null],
    ["/browse/oldtestament/isaiah/58#v-3 ", null],
    ["/browse/oldtestament/isaiah", null],
    ["/browse/oldtestament/isaiah/67", null],
    ["/browse/oldtestament/isaiah/0", null],
    ["/browse/newtestament/isaiah/58", null],
    ["/browse/pearl/notabook/7", null],
    ["/browse/oldtestament/moses/7", null],
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
  for (const volume of ["oldtestament", "newtestament", "bookofmormon", "doctrineandcovenants", "pearl"]) {
    for (const book of bundle(volume).books) {
      // Only books the guides' reference parser knows can be linked at all.
      if (!findBook(book.title)) continue;
      // The shared canon and the local data agree on each book's place and size.
      assert.equal(findBook(book.title).canonicalVolume, volume, book.title);
      assert.equal(findBook(book.title).chapters, book.chapters.length, book.title);
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

const church = (path) => `https://www.churchofjesuschrist.org/study/scriptures/${path}`;

test("Gospel Library scripture links preview their chapter in every standard work, in or outside the lesson", () => {
  const cases = [
    ["ot/isa/1?lang=eng", "oldtestament", "isaiah", 1],
    ["ot/isa/58?lang=eng", "oldtestament", "isaiah", 58],
    ["ot/2-kgs/25?lang=eng", "oldtestament", "2kings", 25],
    ["ot/ps/23?lang=eng", "oldtestament", "psalms", 23],
    ["ot/song/2?lang=eng", "oldtestament", "songofsolomon", 2],
    ["nt/luke/4?lang=eng", "newtestament", "luke", 4],
    ["nt/1-jn/4?lang=eng", "newtestament", "1john", 4],
    ["nt/rev/22?lang=eng", "newtestament", "revelation", 22],
    ["bofm/1-ne/3?lang=eng", "bookofmormon", "1nephi", 3],
    ["bofm/w-of-m/1?lang=eng", "bookofmormon", "wordsofmormon", 1],
    ["bofm/mosiah/3?lang=eng", "bookofmormon", "mosiah", 3],
    ["dc-testament/dc/19?lang=eng", "doctrineandcovenants", "doctrineandcovenants", 19],
    ["dc-testament/dc/138?lang=eng", "doctrineandcovenants", "doctrineandcovenants", 138],
    ["pgp/moses/7?lang=eng", "pearl", "moses", 7],
    ["pgp/abr/3?lang=eng", "pearl", "abraham", 3],
    ["pgp/js-m/1?lang=eng", "pearl", "josephsmithmatthew", 1],
    ["pgp/js-h/1?lang=eng", "pearl", "josephsmithhistory", 1],
    ["pgp/a-of-f/1?lang=eng", "pearl", "articlesoffaith", 1],
    // No language named is the default (English) text.
    ["ot/isa/1", "oldtestament", "isaiah", 1],
  ];
  // Text that is no reference (a title, a bare number) leaves the whole chapter.
  for (const [path, volume, book, chapter] of cases) {
    assert.deepEqual(passageFromLink(church(path), null, isaiah, "Read the chapter"), passageTarget(volume, book, chapter), path);
  }
  assert.deepEqual(
    passageFromLink("https://churchofjesuschrist.org/study/scriptures/ot/isa/1?lang=eng", null, isaiah, null),
    passageTarget("oldtestament", "isaiah", 1)
  );
  // The full chapter opens in our own reader, never on the Church site.
  assert.equal(chapterHref(passageFromLink(church("pgp/moses/7?lang=eng"), null, isaiah, "Moses 7:18")), "/browse/pearl/moses/7#v-18");
  assert.equal(chapterHref(passageFromLink(church("dc-testament/dc/19?lang=eng"), null, isaiah, "")), "/browse/dnc/doctrineandcovenants/19");
});

test("every book of the shared canon reads from its Gospel Library path, through to its last chapter", () => {
  const slugs = new Set();
  for (const volume of ["oldtestament", "newtestament", "bookofmormon", "doctrineandcovenants", "pearl"]) {
    for (const local of bundle(volume).books) {
      const book = findBook(local.title);
      if (!book) continue;
      const last = passageFromLink(church(`${book.volume}/${book.abbr}/${book.chapters}?lang=eng`), null, isaiah, null);
      assert.deepEqual(last, passageTarget(volume, book.slug, book.chapters), local.title);
      assert.equal(passageFromLink(church(`${book.volume}/${book.abbr}/${book.chapters + 1}?lang=eng`), null, isaiah, null), null);
      slugs.add(book.slug);
    }
  }
  // 39 + 27 + 15 + 1 + 5: every canon book has local scripture, and every local book a canon entry.
  assert.equal(slugs.size, 87);
});

test("a verse label narrows a chapter-only link only when it is exactly that chapter's reference", () => {
  const isa1 = church("ot/isa/1?lang=eng");
  // The actual guide citations: chapter-only URLs whose text names the verses.
  assert.deepEqual(passageFromLink(isa1, null, isaiah, "Isaiah 1:1"), passageTarget("oldtestament", "isaiah", 1, 1, 1));
  assert.deepEqual(passageFromLink(church("pgp/moses/7?lang=eng"), null, isaiah, "Moses 7:18"), passageTarget("pearl", "moses", 7, 18, 18));
  const narrowed = [
    ["nt/luke/4?lang=eng", "Luke 4:16–21", ["newtestament", "luke", 4, 16, 21]],
    ["nt/luke/4?lang=eng", "Luke 4:16-21", ["newtestament", "luke", 4, 16, 21]],
    ["nt/luke/4?lang=eng", "  Luke\n4:16–21 ", ["newtestament", "luke", 4, 16, 21]],
    ["dc-testament/dc/19?lang=eng", "Doctrine and Covenants 19:16–19", ["doctrineandcovenants", "doctrineandcovenants", 19, 16, 19]],
    ["dc-testament/dc/19?lang=eng", "D&C 19:16–19", ["doctrineandcovenants", "doctrineandcovenants", 19, 16, 19]],
    ["bofm/mosiah/3?lang=eng", "Mosiah 3:7", ["bookofmormon", "mosiah", 3, 7, 7]],
    ["bofm/3-ne/9?lang=eng", "3 Nephi 9:14", ["bookofmormon", "3nephi", 9, 14, 14]],
    ["ot/2-kgs/25?lang=eng", "2 Kings 25:9", ["oldtestament", "2kings", 25, 9, 9]],
    ["pgp/js-h/1?lang=eng", "Joseph Smith—History 1:15–20", ["pearl", "josephsmithhistory", 1, 15, 20]],
    ["pgp/js-h/1?lang=eng", "Joseph Smith--History 1:17", ["pearl", "josephsmithhistory", 1, 17, 17]],
    ["pgp/a-of-f/1?lang=eng", "Articles of Faith 1:13", ["pearl", "articlesoffaith", 1, 13, 13]],
  ];
  for (const [path, label, expected] of narrowed) {
    assert.deepEqual(passageFromLink(church(path), null, isaiah, label), passageTarget(...expected), label);
  }
  // The chapter itself, or text that does not begin as a reference, leaves the URL's whole chapter (as the
  // guides' own labels do). A trailing note without numbers is set aside.
  const whole = [
    ["ot/isa/58?lang=eng", "Isaiah 58 (KJV)", 58],
    ["ot/isa/59?lang=eng", "59", 59],
    ["ot/isa/1?lang=eng", "Isaiah 1", 1],
    ["ot/isa/1?lang=eng", "", 1],
    ["ot/isa/1?lang=eng", "Read the chapter", 1],
    ["ot/isa/1?lang=eng", "see the prophecy", 1],
    ["ot/isa/1?lang=eng", "Isaiah's opening vision", 1],
    ["ot/isa/1?lang=eng", "The Book of Isaiah, chapter 1", 1],
  ];
  for (const [path, label, chapter] of whole) {
    assert.deepEqual(passageFromLink(church(path), null, isaiah, label), passageTarget("oldtestament", "isaiah", chapter), label);
  }
  assert.deepEqual(passageFromLink(church("nt/rev/22?lang=eng"), null, isaiah, "22:5"), passageTarget("newtestament", "revelation", 22));
  assert.deepEqual(passageFromLink(isa1, null, isaiah, "Isaiah 1:1 (KJV)"), passageTarget("oldtestament", "isaiah", 1, 1, 1));
  assert.deepEqual(passageFromLink(isa1, null, isaiah, "Isaiah 1:1–3 (emphasis added)"), passageTarget("oldtestament", "isaiah", 1, 1, 3));
  // A reference to another chapter or book, or one that is not valid, leaves the link alone.
  for (const label of ["Isaiah 2:3", "Isaiah 2", "Jeremiah 1:1", "Moses 7:18", "Isaiah 1:1b", "Isaiah 1:5–3", "Isaiah 1:0", "Isaiah 67:1"]) {
    assert.equal(passageFromLink(isa1, null, isaiah, label), null, label);
  }
  assert.equal(passageFromLink(church("ot/isa/58?lang=eng"), null, isaiah, "Isaiah 59 (KJV)"), null);
});

test("text that begins as a reference but is not exactly one leaves the link alone (review regressions)", () => {
  const isa1 = church("ot/isa/1?lang=eng");
  const labels = [
    // The reviewed cases: each once previewed all of Isaiah 1.
    "Isaiah 1:1–2:3",
    "Isaiah 1:1,3",
    "Isaiah 1–2",
    "Isaiah 1:1-",
    "Isaiah 1:1–",
    "Isaiah 1:1:2",
    // The same kinds of scope, written other ways.
    "Isaiah 1:1-2:3",
    "Isaiah 1:1, 3",
    "Isaiah 1:1; 1:3",
    "Isaiah 1-2",
    "Isaiah 1:",
    "Isaiah 1:1.",
    "Isaiah 1:1—3",
    "Isaiah 1 and 2",
    "Isaiah 1:1 and 2:3",
    "Isaiah 1:1; Jeremiah 1:1",
    "Isaiah 1:1 (Isaiah 2:3)",
    "Isaiah 1:1 (KJV) (2)",
  ];
  for (const label of labels) {
    assert.equal(passageFromLink(isa1, null, isaiah, label), null, label);
    assert.equal(passageFromLink(isa1, null, isaiah, `  ${label}\n`), null, `padded ${label}`);
  }
  // The guides' own chapter range on a chapter link stays an ordinary link, rather than showing one chapter of it.
  assert.equal(passageFromLink(church("bofm/1-ne/20?lang=eng"), null, isaiah, "1 Nephi 20–21"), null);
  // Several references in one text, of the URL's chapter or not.
  assert.equal(passageFromLink(church("bofm/3-ne/11?lang=eng"), null, isaiah, "3 Nephi 11:14–15, John 20:27"), null);
  // An explicit selector does not rescue invalid text.
  assert.equal(passageFromLink(church("ot/isa/1?lang=eng&id=p1"), null, isaiah, "Isaiah 1:1–2:3"), null);
  assert.equal(passageFromLink(church("ot/isa/1.1?lang=eng#p1"), null, isaiah, "Isaiah 1:1,3"), null);
  // The canon's own reading: a claim that fails is marked invalid; text that makes no claim is not a reference.
  for (const label of ["Isaiah 1:1–2:3", "Isaiah 1:1,3", "Isaiah 1–2", "Isaiah 1:1-", "Isaiah 1:1–", "Isaiah 1:1:2"]) {
    assert.deepEqual(exactReference(label), { valid: false }, label);
  }
  for (const text of ["Read the chapter", "Isaiah's opening vision", "22:5", "59", "", "Isaiah"]) {
    assert.equal(exactReference(text), null, text);
  }
  assert.equal(exactReference("Isaiah 1:1").valid, true);
});

test("Gospel Library verse selectors choose the verses, and every selector must agree", () => {
  const luke = (suffix) => church(`nt/luke/4${suffix}`);
  const pick = (first, last) => passageTarget("newtestament", "luke", 4, first, last);
  const read = [
    ["?lang=eng&id=p18", null, pick(18, 18)],
    ["?lang=eng&id=p16-p21", null, pick(16, 21)],
    ["?id=p16-p21&lang=eng#p16", null, pick(16, 21)],
    ["?lang=eng&id=p16-p16", null, pick(16, 16)],
    ["?lang=eng#p18", null, pick(18, 18)],
    [".18?lang=eng", null, pick(18, 18)],
    [".16-21?lang=eng#p16", null, pick(16, 21)],
    [".16-21?lang=eng&id=p16-p21#p16", null, pick(16, 21)],
    // The text agrees with the selectors, or names only the chapter: the selectors decide.
    ["?lang=eng&id=p16-p21", "Luke 4:16–21", pick(16, 21)],
    [".16-21?lang=eng", "Luke 4:16–21", pick(16, 21)],
    ["?lang=eng&id=p18", "Luke 4", pick(18, 18)],
    // A lone fragment marks where the text's range starts.
    ["?lang=eng#p16", "Luke 4:16–21", pick(16, 21)],
  ];
  for (const [suffix, label, expected] of read) assert.deepEqual(passageFromLink(luke(suffix), null, isaiah, label), expected, suffix);
  const refused = [
    ["?lang=eng&id=p21-p16", null],
    ["?lang=eng&id=p16,p18", null],
    ["?lang=eng&id=p16-p18,p20", null],
    ["?lang=eng&id=p16%2Cp18", null],
    ["?lang=eng&id=p0", null],
    ["?lang=eng&id=p016", null],
    ["?lang=eng&id=16", null],
    ["?lang=eng&id=", null],
    ["?lang=eng&id=p16&id=p17", null],
    ["?lang=eng&id=title1", null],
    [".21-16?lang=eng", null],
    [".0?lang=eng", null],
    [".016?lang=eng", null],
    [".16-21?lang=eng&id=p17", null],
    ["?lang=eng&id=p16-p21#p18", null],
    [".16?lang=eng#p17", null],
    ["?lang=eng#p0", null],
    ["?lang=eng#note16a", null],
    ["?lang=eng#title1", null],
    ["?lang=eng#p16-p21", null],
    ["?lang=eng#", null],
    // Only English, the text we have; nothing else in the query.
    ["?lang=spa", null],
    ["?lang=spa&id=p18", null],
    ["?lang=eng&lang=eng", null],
    ["?lang=eng&utm_source=guide", null],
    ["?lang=eng&", null],
    ["?", null],
    // Text that contradicts the selectors.
    ["?lang=eng&id=p16-p21", "Luke 4:18"],
    [".16-21?lang=eng", "Luke 4:16–22"],
    ["?lang=eng#p18", "Luke 4:16–21"],
    ["?lang=eng&id=p18", "Luke 5:18"],
  ];
  for (const [suffix, label] of refused) assert.equal(passageFromLink(luke(suffix), null, isaiah, label), null, `${suffix} ${label}`);
});

test("only exact Gospel Library scripture URLs are read; every other link stays an ordinary link", () => {
  const refused = [
    // Church pages that are not scripture chapters.
    church("bd/isaiah?lang=eng"),
    church("gs/zion?lang=eng"),
    church("tg/fasting?lang=eng"),
    church("jst/jst-gen/1?lang=eng"),
    "https://www.churchofjesuschrist.org/study/manual/come-follow-me-for-home-and-church-old-testament-2026/42?lang=eng",
    "https://www.churchofjesuschrist.org/study/general-conference/2015/04/the-sabbath-is-a-delight?lang=eng",
    "https://scripturecentral.org/archive/books/book-chapter/isaiah-58",
    "https://www.lds.org/scriptures/ot/isa/1?lang=eng",
    // Unknown or mismatched volume, book, or chapter.
    church("ot/isa?lang=eng"),
    church("ot/isa/0?lang=eng"),
    church("ot/isa/01?lang=eng"),
    church("ot/isa/67?lang=eng"),
    church("nt/isa/1?lang=eng"),
    church("ot/isaiah/1?lang=eng"),
    church("ot/moses/7?lang=eng"),
    church("pgp/moses/9?lang=eng"),
    church("pgp/js-h/2?lang=eng"),
    church("dc-testament/dc/139?lang=eng"),
    church("dc/dc/19?lang=eng"),
    church("OT/isa/1?lang=eng"),
    church("ot/ISA/1?lang=eng"),
    // Extra or altered path.
    church("ot/isa/1/?lang=eng"),
    church("ot/isa/1/extra?lang=eng"),
    church("ot/isa/1.1.2?lang=eng"),
    church("ot/isa/1%3Flang=eng"),
    church("ot%2Fisa/1?lang=eng"),
    church("ot/isa%2F1?lang=eng"),
    church("ot/isa/../../nt/luke/4?lang=eng"),
    church("bd/../ot/isa/1?lang=eng"),
    church("./ot/isa/1?lang=eng"),
    "https://www.churchofjesuschrist.org/study//scriptures/ot/isa/1?lang=eng",
    "https://www.churchofjesuschrist.org\\study\\scriptures\\ot\\isa\\1",
    `${church("ot/isa/1?lang=eng")} `,
    ` ${church("ot/isa/1?lang=eng")}`,
    `${church("ot/isa/1?lang=eng")}\n`,
    // Other schemes, hosts, ports, and user info.
    "http://www.churchofjesuschrist.org/study/scriptures/ot/isa/1?lang=eng",
    "//www.churchofjesuschrist.org/study/scriptures/ot/isa/1?lang=eng",
    "HTTPS://www.churchofjesuschrist.org/study/scriptures/ot/isa/1?lang=eng",
    "https://WWW.churchofjesuschrist.org/study/scriptures/ot/isa/1?lang=eng",
    "https://www.churchofjesuschrist.org.evil.example/study/scriptures/ot/isa/1?lang=eng",
    "https://evil.example/www.churchofjesuschrist.org/study/scriptures/ot/isa/1?lang=eng",
    "https://wwwchurchofjesuschrist.org/study/scriptures/ot/isa/1?lang=eng",
    "https://m.churchofjesuschrist.org/study/scriptures/ot/isa/1?lang=eng",
    "https://www.churchofjesuschrist.org:443/study/scriptures/ot/isa/1?lang=eng",
    "https://www.churchofjesuschrist.org./study/scriptures/ot/isa/1?lang=eng",
    "https://user@www.churchofjesuschrist.org/study/scriptures/ot/isa/1?lang=eng",
    "https://evil.example@www.churchofjesuschrist.org/study/scriptures/ot/isa/1?lang=eng",
    "javascript:alert(1)//https://www.churchofjesuschrist.org/study/scriptures/ot/isa/1",
  ];
  for (const href of refused) assert.equal(passageFromLink(href, null, isaiah, "Isaiah 1:1"), null, href);
  // A Gospel Library URL never takes our own data-last range end.
  assert.equal(passageFromLink(church("ot/isa/1?lang=eng"), "3", isaiah, "Isaiah 1:1"), null);
});

test("a scripture-shaped label never makes a non-scripture destination a passage", () => {
  // The October 12 bibliography: Scripture Central chapter articles labeled "Isaiah 58" through "Isaiah 66".
  for (let chapter = 58; chapter <= 66; chapter += 1) {
    const href = `https://scripturecentral.org/archive/books/book-chapter/isaiah-${chapter}`;
    assert.equal(passageFromLink(href, null, isaiah, `Isaiah ${chapter}`), null, href);
  }
  // A Church page that is not a scripture chapter, labeled with a verse.
  assert.equal(passageFromLink(church("bd/isaiah?lang=eng"), null, isaiah, "Isaiah 1:1"), null);
  // The same label on the chapter's own Gospel Library URL is still a passage.
  assert.deepEqual(passageFromLink(church("ot/isa/58?lang=eng"), null, isaiah, "Isaiah 58"), passageTarget("oldtestament", "isaiah", 58));
});
