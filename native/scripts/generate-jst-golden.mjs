// Writes native/testdata/jst-golden.json: for each JST fixture chapter, the excerpts the website's
// /api/scriptures/jst returns, the KJV verses, and the website's own `readJstChapter` reading of them, so the
// native port is checked against the website's results rather than against a re-derivation.
// Run: node --experimental-strip-types native/scripts/generate-jst-golden.mjs
import fs from "node:fs";
import { buildJstChapterExcerpts, readJstChapter } from "../../src/lib/jst.ts";

const root = new URL("../../", import.meta.url);
const fixtures = JSON.parse(fs.readFileSync(new URL("src/lib/jst.fixtures.json", root), "utf8")).entries;
const volumes = ["oldtestament", "newtestament"].map((volume) =>
  JSON.parse(fs.readFileSync(new URL(`public/scripture-data/${volume}.json`, root), "utf8"))
);
const kjvChapter = (book, chapter) =>
  volumes.flatMap((v) => v.books).find((b) => b.book === book).chapters.find((c) => c.chapter === chapter).verses
    .map(({ verse, text }) => ({ verse, text }));

const cases = [
  ["mark", 9, "jst-mark-9"], ["matthew", 2, "jst-matthew-3"], ["matthew", 3, "jst-matthew-3"],
  ["exodus", 34, "jst-exodus-34"], ["genesis", 8, "jst-genesis-9"], ["genesis", 9, "jst-genesis-9"],
  ["genesis", 3, "jst-genesis-1-8"], ["genesis", 6, "jst-genesis-1-8"],
];
const out = cases.map(([book, chapter, id]) => {
  const excerpts = buildJstChapterExcerpts({ book, chapter }, [fixtures[id]]);
  const verses = kjvChapter(book, chapter);
  const reading = readJstChapter(excerpts, verses);
  return {
    book,
    chapter,
    excerpts,
    verses,
    rows: [...reading.rows.values()],
    leading: reading.leading.map((e) => e.id),
    integrated: reading.integrated.map((e) => e.id),
  };
});
fs.writeFileSync(new URL("native/testdata/jst-golden.json", root), JSON.stringify(out) + "\n");
