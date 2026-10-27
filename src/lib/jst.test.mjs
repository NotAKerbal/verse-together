import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  EMPTY_JST_STATE,
  buildJstChapterExcerpts,
  jstChapterTarget,
  jstEntryIdsForChapter,
  jstRequestKey,
  parseCompareReference,
  jstPassageText,
  jstRowChangesWording,
  jstRowText,
  parseJstPreference,
  readJstChapter,
  readJstResponse,
  recordJstOutcome,
  serializeJstPreference,
  summarizeJst,
} from "./jst.ts";
import { fetchJstEntry, handleJstRequest } from "./jstApi.server.ts";

// Real entries from the Open Scripture API study helps, captured 2026-10-27.
const fixtures = JSON.parse(fs.readFileSync(new URL("./jst.fixtures.json", import.meta.url), "utf8")).entries;

// The KJV text the reader shows: the local LDS standard works.
const kjvVolumes = ["oldtestament", "newtestament"].map((volume) =>
  JSON.parse(fs.readFileSync(new URL(`../../public/scripture-data/${volume}.json`, import.meta.url), "utf8"))
);
function kjvChapter(book, chapter) {
  const found = kjvVolumes.flatMap((volume) => volume.books).find((item) => item.book === book);
  return found.chapters.find((item) => item.chapter === chapter).verses;
}

/** A row as text: shared wording plain, {+added+}, [-omitted-], <JST verse>. */
function showRow(row) {
  return row.pieces
    .map((piece) => piece.kind === "same" ? piece.text : piece.kind === "added" ? `{+${piece.text}+}` : piece.kind === "omitted" ? `[-${piece.text}-]` : `<${piece.number}>`)
    .join(" ");
}

function readChapter(book, chapter, entries) {
  const excerpts = buildJstChapterExcerpts({ book, chapter }, entries);
  const verses = kjvChapter(book, chapter);
  return { excerpts, verses, reading: readJstChapter(excerpts, verses) };
}

const wholeText = (excerpt) => excerpt.verses.map((verse) => verse.text).join(" ");

/**
 * What must hold for any chapter read with the JST: each passage's text read back from its rows is the appendix's,
 * word for word; every JST verse number appears once, in order; rows sit only on KJV verses the passage compares
 * to; every KJV word of a row is either shared or marked omitted, once; and nothing with text is left out.
 */
function assertFaithful({ excerpts, verses, reading }, where) {
  for (const excerpt of excerpts) {
    const placed = reading.integrated.includes(excerpt);
    assert.ok(placed || reading.leading.includes(excerpt), `${where}: ${excerpt.label} is shown`);
    assert.ok(!(placed && reading.leading.includes(excerpt)), `${where}: ${excerpt.label} is shown once`);
    if (!placed) continue;
    assert.equal(jstPassageText(reading, excerpt.id), wholeText(excerpt), `${where}: ${excerpt.label} text`);
    const rows = [...reading.rows.values()].filter((row) => row.excerptId === excerpt.id).sort((a, b) => a.verse - b.verse);
    assert.deepEqual(
      rows.flatMap((row) => row.pieces.filter((piece) => piece.kind === "verse").map((piece) => piece.number)),
      excerpt.verses.map((verse) => verse.number),
      `${where}: ${excerpt.label} JST verse numbers`
    );
    for (const row of rows) {
      assert.ok(
        excerpt.comparedSpans.some((span) => row.verse >= span.start && (span.end === null || row.verse <= span.end)),
        `${where}: row ${row.verse} is in ${excerpt.compareReference}`
      );
      const kjv = verses.find((verse) => verse.verse === row.verse);
      assert.ok(kjv, `${where}: row ${row.verse} is a verse of the text`);
      const accounted = row.pieces.filter((piece) => piece.kind === "same" || piece.kind === "omitted").flatMap((piece) => piece.text.split(" "));
      assert.equal(accounted.length, kjv.text.split(/\s+/).filter(Boolean).length, `${where}: KJV ${row.verse} words`);
    }
  }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A fake upstream serving the fixtures by id, recording what was asked for. */
function fixtureFetch(overrides = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const id = url.split("/entry/")[1];
    if (overrides[id]) return overrides[id](url, init);
    if (fixtures[id]) return jsonResponse(200, fixtures[id]);
    return jsonResponse(404, { error: `Entry not found with id: ${id}` });
  };
  return { impl, calls };
}

test("only valid Old and New Testament chapters are targets, with volume aliases normalized", () => {
  assert.deepEqual(jstChapterTarget("newtestament", "mark", 9), { volume: "newtestament", book: "mark", chapter: 9 });
  assert.deepEqual(jstChapterTarget("new-testament", "Mark", "9"), { volume: "newtestament", book: "mark", chapter: 9 });
  assert.deepEqual(jstChapterTarget("old-testament", "genesis", "1"), { volume: "oldtestament", book: "genesis", chapter: 1 });
  assert.equal(jstChapterTarget("bookofmormon", "1nephi", 1), null);
  assert.equal(jstChapterTarget("dnc", "dc", 1), null);
  assert.equal(jstChapterTarget("pearl", "moses", 1), null);
  // A book in the other testament, an unknown book, and out-of-range or malformed chapters.
  assert.equal(jstChapterTarget("oldtestament", "mark", 9), null);
  assert.equal(jstChapterTarget("newtestament", "../../x", 9), null);
  assert.equal(jstChapterTarget("newtestament", "mark", 17), null);
  assert.equal(jstChapterTarget("newtestament", "mark", 0), null);
  assert.equal(jstChapterTarget("newtestament", "mark", "9a"), null);
  assert.equal(jstChapterTarget("newtestament", "mark", "1e1"), null);
});

test("entry ids are the chapter's own plus the known cross-chapter entries", () => {
  assert.deepEqual(jstEntryIdsForChapter({ book: "mark", chapter: 9 }), ["jst-mark-9"]);
  assert.deepEqual(jstEntryIdsForChapter({ book: "matthew", chapter: 2 }), ["jst-matthew-2", "jst-matthew-3"]);
  assert.deepEqual(jstEntryIdsForChapter({ book: "genesis", chapter: 8 }), ["jst-genesis-8", "jst-genesis-9"]);
  assert.deepEqual(jstEntryIdsForChapter({ book: "genesis", chapter: 3 }), ["jst-genesis-3", "jst-genesis-1-8"]);
});

test("compare references parse single verses, lists, ranges, and cross-chapter ranges", () => {
  assert.deepEqual(parseCompareReference("Mark 9:4"), {
    book: "mark",
    ranges: [{ startChapter: 9, startVerse: 4, endChapter: 9, endVerse: 4 }],
  });
  assert.deepEqual(parseCompareReference("1 Corinthians 7:1–2, 5, 26, 29–38").ranges.map((r) => [r.startVerse, r.endVerse]), [
    [1, 2],
    [5, 5],
    [26, 26],
    [29, 38],
  ]);
  assert.equal(parseCompareReference("1 Corinthians 7:1").book, "1corinthians");
  assert.equal(parseCompareReference("Psalm 14:1–7").book, "psalms");
  assert.deepEqual(parseCompareReference("Genesis 1:1–6:13").ranges, [{ startChapter: 1, startVerse: 1, endChapter: 6, endVerse: 13 }]);
  assert.equal(parseCompareReference(""), null);
  assert.equal(parseCompareReference("Mark"), null);
  assert.equal(parseCompareReference("Mark 9:8–4"), null);
  assert.equal(parseCompareReference("Mark 9:four"), null);
});

test("Mark 9: JST 9:3 anchors at KJV 9:4, and JST 9:40–48 stays whole at KJV 9:43", () => {
  const excerpts = buildJstChapterExcerpts({ book: "mark", chapter: 9 }, [fixtures["jst-mark-9"]]);
  assert.equal(excerpts.length, 2);
  const [transfiguration, offend] = excerpts;

  assert.equal(transfiguration.label, "JST, Mark 9:3");
  assert.equal(transfiguration.compareReference, "Mark 9:4");
  assert.equal(transfiguration.anchorVerse, 4);
  assert.deepEqual(transfiguration.verses.map((v) => v.number), ["3"]);
  assert.match(transfiguration.verses[0].text, /John the Baptist and Moses/);

  assert.equal(offend.label, "JST, Mark 9:40–48");
  assert.equal(offend.anchorVerse, 43);
  assert.deepEqual(offend.comparedSpans, [{ start: 43, end: 48 }]);
  // Nine JST verses against six KJV verses: every one is kept with its JST number.
  assert.deepEqual(offend.verses.map((v) => v.number), ["40", "41", "42", "43", "44", "45", "46", "47", "48"]);
  assert.match(offend.verses[4].text, /let every man stand or fall, by himself/);
});

test("excerpts comparing to another chapter are shown with that chapter, not the entry's number", () => {
  const matthew3 = fixtures["jst-matthew-3"];
  const inChapter2 = buildJstChapterExcerpts({ book: "matthew", chapter: 2 }, [matthew3]);
  assert.deepEqual(inChapter2.map((e) => [e.label, e.anchorVerse]), [
    ["JST, Matthew 3:4–6", 4],
    ["JST, Matthew 3:24–26", 23],
  ]);
  const inChapter3 = buildJstChapterExcerpts({ book: "matthew", chapter: 3 }, [matthew3]);
  assert.deepEqual(inChapter3.map((e) => [e.label, e.anchorVerse]), [
    ["JST, Matthew 3:34–36", 8],
    ["JST, Matthew 3:38–40", 11],
    ["JST, Matthew 3:43–46", 15],
  ]);
  const genesis8 = buildJstChapterExcerpts({ book: "genesis", chapter: 8 }, [fixtures["jst-genesis-9"]]);
  assert.deepEqual(genesis8.map((e) => [e.label, e.anchorVerse]), [["JST, Genesis 9:4–6", 20]]);
  const genesis9 = buildJstChapterExcerpts({ book: "genesis", chapter: 9 }, [fixtures["jst-genesis-9"]]);
  assert.deepEqual(genesis9.map((e) => e.anchorVerse), [4, 16]);
});

test("unlabeled sections repeating labeled verses are dropped; new unlabeled text is kept unanchored", () => {
  const exodus = buildJstChapterExcerpts({ book: "exodus", chapter: 34 }, [fixtures["jst-exodus-34"]]);
  assert.equal(exodus.length, 1);
  assert.deepEqual(exodus[0].verses.map((v) => v.number), ["1", "2", "14"]);
  assert.deepEqual(exodus[0].comparedSpans, [{ start: 1, end: 2 }, { start: 14, end: 14 }]);

  const entry = {
    _id: "jst-exodus-34",
    sections: [...fixtures["jst-exodus-34"].sections, { label: "", compareReference: "", verses: [{ verseNumber: "7", text: "New text." }] }],
  };
  const withNew = buildJstChapterExcerpts({ book: "exodus", chapter: 34 }, [entry]);
  assert.equal(withNew.length, 2);
  const unanchored = withNew.find((e) => e.anchorVerse === null);
  assert.equal(unanchored.label, "JST excerpt");
  assert.deepEqual(unanchored.verses, [{ number: "7", text: "New text." }]);
  assert.deepEqual(readJstChapter(withNew, kjvChapter("exodus", 34)).leading, [unanchored]);
});

test("an excerpt published elsewhere becomes a chapter note with the source's description", () => {
  const [note] = buildJstChapterExcerpts({ book: "genesis", chapter: 3 }, [fixtures["jst-genesis-1-8"]]);
  assert.equal(note.label, "JST, Genesis 1:1–8:18");
  assert.deepEqual(note.verses, []);
  assert.deepEqual(note.comparedSpans, [{ start: 1, end: null }]);
  assert.match(note.note, /published in the Pearl of Great Price as Selections from the Book of Moses\.$/);
  assert.deepEqual(buildJstChapterExcerpts({ book: "genesis", chapter: 7 }, [fixtures["jst-genesis-1-8"]]), []);
  // The Book of Moses note can't be read in place, so it stays a labeled note before the text.
  const reading = readJstChapter([note], kjvChapter("genesis", 3));
  assert.deepEqual(reading.leading, [note]);
  assert.equal(reading.rows.size, 0);
});

test("Mark 9:3 reads in place of KJV 9:4: the addition is marked, the shared wording isn't", () => {
  const read = readChapter("mark", 9, [fixtures["jst-mark-9"]]);
  assertFaithful(read, "Mark 9");
  const row = read.reading.rows.get(4);
  assert.equal(row.label, "JST, Mark 9:3");
  assert.equal(row.first, true);
  assert.equal(
    showRow(row),
    "<3> And there appeared unto them Elias with Moses, {+or in other words, John the Baptist and Moses;+} and they were talking with Jesus."
  );
  assert.equal(jstRowText(row), fixtures["jst-mark-9"].sections[0].verses[0].text);
  // Verse 3 and 5 are untouched KJV.
  assert.equal(read.reading.rows.has(3), false);
  assert.equal(read.reading.rows.has(5), false);
});

test("Mark 9:40–48: all nine JST verses read across KJV 9:43–48, nothing before or after is touched", () => {
  const read = readChapter("mark", 9, [fixtures["jst-mark-9"]]);
  const { reading } = read;
  assert.deepEqual([...reading.rows.keys()], [4, 43, 44, 45, 46, 47, 48]);
  assert.equal(reading.rows.has(42), false);
  assert.equal(reading.rows.has(49), false);
  assert.deepEqual(reading.leading, []);
  const offend = read.excerpts[1];
  // The whole passage, word for word, in order.
  assert.equal(jstPassageText(reading, offend.id), wholeText(offend));
  assert.equal(reading.rows.get(43).first, true);
  assert.equal(reading.rows.get(44).first, false);
  // Replacement: "And if thy hand" → "Therefore, if thy hand"; JST 9:41 is an addition kept with KJV 43.
  assert.match(showRow(reading.rows.get(43)), /^\[-And-\] <40> \{\+Therefore,\+\} if thy hand offend thee/);
  assert.match(showRow(reading.rows.get(43)), /<41> \{\+For it is better for thee to enter into life without thy brother/);
  // Shared wording reads as the JST writes it, unmarked.
  assert.equal(showRow(reading.rows.get(44)), "where their worm dieth not, and the fire is not quenched.");
  assert.equal(jstRowChangesWording(reading.rows.get(44)), false);
  // A KJV verse the JST replaces whole: its wording is marked omitted, never shown as JST text.
  const replaced = reading.rows.get(46);
  assert.deepEqual(replaced.pieces[0], { kind: "omitted", text: "Where their worm dieth not, and the fire is not quenched." });
  assert.equal(jstRowText(replaced), "Therefore, let every man stand or fall, by himself, and not for another; or not trusting another.");
  // A single-word substitution inside shared wording.
  assert.match(showRow(reading.rows.get(47)), /offend thee, pluck \[-it-\] \{\+him\+\} out\./);
  assert.match(showRow(reading.rows.get(48)), /and \{\+where\+\} the fire is not quenched\.$/);
});

test("Exodus 34:1–2, 14 reads in place of KJV 1–2 and 14 and leaves the gap, 3–13, untouched", () => {
  const read = readChapter("exodus", 34, [fixtures["jst-exodus-34"]]);
  assertFaithful(read, "Exodus 34");
  const { reading } = read;
  assert.deepEqual([...reading.rows.keys()], [1, 2, 14]);
  for (let verse = 3; verse <= 13; verse++) assert.equal(reading.rows.has(verse), false, `verse ${verse}`);
  // The passage is labeled again where it resumes after the gap.
  assert.deepEqual([1, 2, 14].map((verse) => reading.rows.get(verse).first), [true, false, true]);
  assert.equal(showRow(reading.rows.get(14)), "<14> For thou shalt worship no other god; for the Lord, whose name is [-Jealous,-] {+Jehovah,+} is a jealous God.");
  // The unlabeled repeats of verses 1–2 and 14 are not read twice.
  assert.equal(reading.integrated.length, 1);
});

test("passages comparing to another chapter read in that chapter: Matthew 3 in Matthew 2, Genesis 9 in Genesis 8", () => {
  const matthew2 = readChapter("matthew", 2, [fixtures["jst-matthew-3"]]);
  assertFaithful(matthew2, "Matthew 2");
  assert.deepEqual([...matthew2.reading.rows.keys()], [4, 5, 6, 23]);
  assert.deepEqual([...matthew2.reading.rows.values()].map((row) => row.label), [
    "JST, Matthew 3:4–6", "JST, Matthew 3:4–6", "JST, Matthew 3:4–6", "JST, Matthew 3:24–26",
  ]);
  const matthew3 = readChapter("matthew", 3, [fixtures["jst-matthew-3"]]);
  assertFaithful(matthew3, "Matthew 3");
  assert.equal(matthew3.reading.integrated.length, 3);
  const genesis8 = readChapter("genesis", 8, [fixtures["jst-genesis-9"]]);
  assertFaithful(genesis8, "Genesis 8");
  assert.deepEqual([...genesis8.reading.rows.keys()], [20, 21, 22]);
  const genesis9 = readChapter("genesis", 9, [fixtures["jst-genesis-9"]]);
  assertFaithful(genesis9, "Genesis 9");
  // JST 9:21–25, five verses, read across KJV 9:16–17.
  assert.deepEqual([...genesis9.reading.rows.values()].filter((row) => row.label === "JST, Genesis 9:21–25").map((row) => row.verse), [16, 17]);
});

test("verses between numbered runs the appendix doesn't reprint stay KJV; so do compared verses sharing no wording", () => {
  const corinthians = {
    _id: "jst-1corinthians-7",
    sections: [{
      label: "JST, 1 Corinthians 7:29–31, 38",
      compareReference: "1 Corinthians 7:29–38",
      verses: [
        { verseNumber: "29", text: "But I speak unto you who are called unto the ministry. For this I say, brethren, the time that remaineth is but short." },
        { verseNumber: "30", text: "And it shall be with them who weep, as though they wept not;" },
        { verseNumber: "31", text: "And them who use this world, as not using it; for the fashion of this world passeth away." },
        { verseNumber: "38", text: "So then he that giveth himself in marriage doeth well; but he that giveth himself not in marriage doeth better." },
      ],
    }],
  };
  const read = readChapter("1corinthians", 7, [corinthians]);
  assertFaithful(read, "1 Corinthians 7");
  assert.deepEqual([...read.reading.rows.keys()], [29, 30, 31, 38]);
  assert.equal(showRow(read.reading.rows.get(38)), "<38> So then he that giveth [-her-] {+himself+} in marriage doeth well; but he that giveth [-her-] {+himself+} not in marriage doeth better.");

  // JST Matthew 11:13–15 compares to KJV 10–11, 13–14, but shares no wording with 10–11.
  const matthew = {
    _id: "jst-matthew-11",
    sections: [{
      label: "JST, Matthew 11:13–15",
      compareReference: "Matthew 11:10–11, 13–14",
      verses: [
        { verseNumber: "13", text: "But the days will come, when the violent shall have no power; for all the prophets and the law prophesied that it should be thus until John." },
        { verseNumber: "14", text: "Yea, as many as have prophesied have foretold of these days." },
        { verseNumber: "15", text: "And if ye will receive it, verily, he was the Elias, who was for to come and prepare all things." },
      ],
    }],
  };
  const read11 = readChapter("matthew", 11, [matthew]);
  assertFaithful(read11, "Matthew 11");
  assert.deepEqual([...read11.reading.rows.keys()], [13, 14]);
});

test("a passage overlapping one already read in place, or past the end of the text, is shown whole before it", () => {
  const excerpts = buildJstChapterExcerpts({ book: "mark", chapter: 9 }, [fixtures["jst-mark-9"]]);
  const overlap = { ...excerpts[0], id: "overlap#0", label: "JST, Mark 9:3 (again)" };
  const reading = readJstChapter([...excerpts, overlap], kjvChapter("mark", 9));
  assert.deepEqual(reading.leading, [overlap]);
  assert.equal(reading.rows.get(4).excerptId, excerpts[0].id);
  // Text only through verse 10: the 9:43–48 passage has nowhere to go.
  const short = readJstChapter(excerpts, kjvChapter("mark", 9).slice(0, 10));
  assert.deepEqual([...short.rows.keys()], [4]);
  assert.deepEqual(short.leading, [excerpts[1]]);
});

test("toggle off: no excerpts means every verse reads as the KJV, with nothing to replace", () => {
  const verses = kjvChapter("mark", 9);
  const off = readJstChapter([], verses);
  assert.equal(off.rows.size, 0);
  assert.deepEqual(off.leading, []);
  // Reading with the JST never changes the KJV verses it was given.
  const before = JSON.stringify(verses);
  readJstChapter(buildJstChapterExcerpts({ book: "mark", chapter: 9 }, [fixtures["jst-mark-9"]]), verses);
  assert.equal(JSON.stringify(verses), before);
});

test("every fixture chapter reads faithfully", () => {
  for (const [book, chapter, id] of [
    ["mark", 9, "jst-mark-9"], ["matthew", 2, "jst-matthew-3"], ["matthew", 3, "jst-matthew-3"],
    ["exodus", 34, "jst-exodus-34"], ["genesis", 8, "jst-genesis-9"], ["genesis", 9, "jst-genesis-9"],
    ["genesis", 1, "jst-genesis-1-8"], ["genesis", 6, "jst-genesis-1-8"],
  ]) assertFaithful(readChapter(book, chapter, [fixtures[id]]), `${book} ${chapter}`);
});

// The whole appendix, when a saved copy is given: JST_CORPUS=/path/to/all.json ({ "<id>": { body: <entry> } }).
test("full appendix audit: every passage reads in place faithfully", { skip: !process.env.JST_CORPUS && "set JST_CORPUS to run" }, () => {
  const saved = JSON.parse(fs.readFileSync(process.env.JST_CORPUS, "utf8"));
  const entries = Object.fromEntries(Object.entries(saved).filter(([, value]) => Array.isArray(value?.body?.sections)).map(([id, value]) => [id, value.body]));
  const shown = new Set();
  let integrated = 0;
  for (const volume of kjvVolumes) for (const book of volume.books) for (const chapter of book.chapters) {
    const chapterEntries = jstEntryIdsForChapter({ book: book.book, chapter: chapter.chapter }).map((id) => entries[id]).filter(Boolean);
    if (chapterEntries.length === 0) continue;
    const read = readChapter(book.book, chapter.chapter, chapterEntries);
    assertFaithful(read, `${book.book} ${chapter.chapter}`);
    for (const excerpt of read.excerpts) shown.add(excerpt.id);
    // Only the Book of Moses note, which has no text, is left out of the reading.
    assert.deepEqual(read.reading.leading.filter((excerpt) => excerpt.verses.length > 0), [], `${book.book} ${chapter.chapter}`);
    integrated += read.reading.integrated.length;
  }
  const sections = Object.values(entries).flatMap((entry) => entry.sections.map((section, index) => ({ id: `${entry._id}#${index}`, section })));
  // Sections never shown anywhere are only unlabeled repeats of labeled ones.
  for (const { id, section } of sections.filter(({ id }) => !shown.has(id))) {
    assert.equal(section.label, "", id);
  }
  assert.ok(integrated >= 142, `${integrated} passages read in place`);
});

test("malformed upstream data is skipped rather than shown", () => {
  const excerpts = buildJstChapterExcerpts({ book: "mark", chapter: 9 }, [
    null,
    "nope",
    { _id: "jst-mark-9", sections: [null, { label: "JST, Mark 9:1", compareReference: "Mark 9:1", verses: [{ verseNumber: 1, text: 42 }, { verseNumber: "1", text: "  Kept   text " }] }] },
  ]);
  assert.equal(excerpts.length, 1);
  assert.deepEqual(excerpts[0].verses, [{ number: "1", text: "Kept text" }]);
});

test("browser state: stale answers read as loading, failures are distinct from empty, cache wins", () => {
  const mark9 = jstRequestKey({ volume: "newtestament", book: "mark", chapter: 9 });
  const mark10 = jstRequestKey({ volume: "newtestament", book: "mark", chapter: 10 });
  assert.equal(jstRequestKey(null), "");
  assert.deepEqual(summarizeJst("", EMPTY_JST_STATE), { status: "off" });
  assert.deepEqual(summarizeJst(mark9, EMPTY_JST_STATE), { status: "loading" });

  const excerpts = buildJstChapterExcerpts({ book: "mark", chapter: 9 }, [fixtures["jst-mark-9"]]);
  const ready = recordJstOutcome(EMPTY_JST_STATE, mark9, { status: "ready", excerpts });
  assert.equal(summarizeJst(mark9, ready).status, "ready");
  // The reader moved to Mark 10 before Mark 9's answer was replaced: Mark 9's excerpts must not show.
  assert.deepEqual(summarizeJst(mark10, ready), { status: "loading" });

  const empty = recordJstOutcome(ready, mark10, { status: "ready", excerpts: [] });
  assert.deepEqual(summarizeJst(mark10, empty), { status: "empty" });
  const failed = recordJstOutcome(ready, mark10, { status: "failed", message: "The JST source answered 500." });
  assert.deepEqual(summarizeJst(mark10, failed), { status: "failed", message: "The JST source answered 500." });
  assert.equal(summarizeJst(mark10, failed, []).status, "empty");
  assert.equal(recordJstOutcome(ready, "", { status: "ready", excerpts: [] }), ready);
});

test("response bodies are accepted only for the chapter asked for", () => {
  const target = { volume: "newtestament", book: "mark", chapter: 9 };
  assert.deepEqual(readJstResponse({ volume: "newtestament", book: "mark", chapter: 9, excerpts: [] }, target), []);
  assert.equal(readJstResponse({ volume: "newtestament", book: "mark", chapter: 10, excerpts: [] }, target), null);
  assert.equal(readJstResponse({ book: "mark", chapter: 9 }, target), null);
  assert.equal(readJstResponse(null, target), null);
});

test("the preference is off unless this device stored it on", () => {
  assert.equal(parseJstPreference(null), false);
  assert.equal(parseJstPreference(""), false);
  assert.equal(parseJstPreference("0"), false);
  assert.equal(parseJstPreference("true"), false);
  assert.equal(parseJstPreference(serializeJstPreference(true)), true);
  assert.equal(parseJstPreference(serializeJstPreference(false)), false);
});

test("route: Mark 9 returns both excerpts from the fixed upstream entry URL", async () => {
  const { impl, calls } = fixtureFetch();
  const result = await handleJstRequest(new URLSearchParams("volume=new-testament&book=mark&chapter=9"), impl);
  assert.equal(result.status, 200);
  assert.match(result.cacheControl, /public/);
  assert.equal(result.body.book, "mark");
  assert.equal(result.body.chapter, 9);
  assert.deepEqual(result.body.excerpts.map((e) => e.anchorVerse), [4, 43]);
  assert.deepEqual(calls.map((c) => c.url), ["https://openscriptureapi.org/api/study-helps/v1/lds/en/entry/jst-mark-9"]);
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("route: Matthew 2 merges in JST Matthew 3's sections; a 404 own entry means none", async () => {
  const { impl, calls } = fixtureFetch();
  const result = await handleJstRequest(new URLSearchParams("volume=newtestament&book=matthew&chapter=2"), impl);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.excerpts.map((e) => e.label), ["JST, Matthew 3:4–6", "JST, Matthew 3:24–26"]);
  assert.equal(calls.length, 2);
});

test("route: a chapter with no appendix entry is an empty 200, not an error", async () => {
  const { impl } = fixtureFetch();
  const result = await handleJstRequest(new URLSearchParams("volume=newtestament&book=mark&chapter=1"), impl);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.excerpts, []);
});

test("route: invalid or non-Bible requests are rejected without calling upstream", async () => {
  for (const query of [
    "volume=bookofmormon&book=1nephi&chapter=1",
    "volume=newtestament&book=mark&chapter=99",
    "volume=newtestament&book=https://evil.example&chapter=1",
    "volume=newtestament&book=mark",
    "",
  ]) {
    const { impl, calls } = fixtureFetch();
    const result = await handleJstRequest(new URLSearchParams(query), impl);
    assert.equal(result.status, 400, query);
    assert.equal(result.cacheControl, "no-store");
    assert.equal(calls.length, 0, query);
  }
});

test("route: upstream failures are errors, distinct from no excerpts", async () => {
  const params = new URLSearchParams("volume=newtestament&book=mark&chapter=9");
  const serverError = fixtureFetch({ "jst-mark-9": () => jsonResponse(500, { error: "boom" }) });
  const failed = await handleJstRequest(params, serverError.impl);
  assert.equal(failed.status, 502);
  assert.equal(failed.cacheControl, "no-store");
  assert.match(failed.body.error, /500/);

  const htmlNotFound = fixtureFetch({ "jst-mark-9": () => new Response("<html>gone</html>", { status: 404 }) });
  assert.equal((await handleJstRequest(params, htmlNotFound.impl)).status, 502);

  const timeout = fixtureFetch({
    "jst-mark-9": () => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })),
  });
  const timedOut = await handleJstRequest(params, timeout.impl);
  assert.equal(timedOut.status, 504);

  const offline = fixtureFetch({ "jst-mark-9": () => Promise.reject(new TypeError("fetch failed")) });
  assert.equal((await handleJstRequest(params, offline.impl)).status, 502);

  const garbage = fixtureFetch({ "jst-mark-9": () => new Response("not json", { status: 200 }) });
  assert.equal((await handleJstRequest(params, garbage.impl)).status, 502);

  const huge = fixtureFetch({ "jst-mark-9": () => new Response("x".repeat(300 * 1024), { status: 200 }) });
  assert.equal((await handleJstRequest(params, huge.impl)).status, 502);
});

test("route: a real timeout aborts a hanging upstream request", async () => {
  const hanging = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    });
  await assert.rejects(fetchJstEntry("jst-mark-9", hanging, 20), (error) => error.timedOut === true);
  await assert.rejects(fetchJstEntry("https://evil.example", hanging, 20), /Invalid JST entry id/);
});


test("route: malformed or mismatched upstream entries are errors rather than empty chapters", async () => {
  const params = new URLSearchParams("volume=newtestament&book=mark&chapter=9");
  for (const body of [{}, [], { error: "unavailable" },
    { ...fixtures["jst-mark-9"], _id: "jst-mark-8" },
    { ...fixtures["jst-mark-9"], sections: [] },
    { ...fixtures["jst-mark-9"], sections: [{ label: "JST", compareReference: "Mark 9:4", verses: [{}] }] },
  ]) {
    const upstream = fixtureFetch({ "jst-mark-9": () => jsonResponse(200, body) });
    const result = await handleJstRequest(params, upstream.impl);
    assert.equal(result.status, 502);
    assert.equal(result.cacheControl, "no-store");
  }
  const generic404 = fixtureFetch({ "jst-mark-9": () => jsonResponse(404, { error: "Resource unavailable" }) });
  assert.equal((await handleJstRequest(params, generic404.impl)).status, 502);
});

test("upstream body read failures retain timeout status, and chunked oversized bodies are cancelled", async () => {
  const brokenBody = async () => new Response(new ReadableStream({
    start(controller) { controller.error(Object.assign(new Error("timed out"), { name: "TimeoutError" })); },
  }));
  await assert.rejects(fetchJstEntry("jst-mark-9", brokenBody), (error) => error.timedOut === true);
  let cancelled = false;
  const oversized = async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(128 * 1024)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(fetchJstEntry("jst-mark-9", oversized), /too large/);
  assert.equal(cancelled, true);
});
