import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

const chapter = {
  volume: "bookofmormon",
  book: "1nephi",
  chapter: 1,
  reference: "1 Nephi 1",
  verses: [{ verse: 1, text: "First text", footnotes: [{ footnote: "First note", start: 0, end: 5 }] }],
  fetchedAt: 100,
};

describe("chapter cache", () => {
  test("reads and updates chapter bundles with their footnotes", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.cache.upsertChapterBundle, chapter);
    const ref = { volume: chapter.volume, book: chapter.book, chapter: chapter.chapter };
    expect(await t.query(api.cache.getChapterBundle, ref)).toEqual({
      reference: chapter.reference,
      verseCount: 1,
      fetchedAt: 100,
      verses: chapter.verses,
    });
    const verses = [{ verse: 1, text: "Updated text", footnotes: [{ footnote: "Replacement note" }] }];
    await t.mutation(api.cache.upsertChapterBundle, { ...chapter, verses, fetchedAt: 200 });
    expect(await t.query(api.cache.getChapterBundle, ref)).toEqual({
      reference: chapter.reference,
      verseCount: 1,
      fetchedAt: 200,
      verses,
    });
  });

  test("preserves existing legacy rows without creating or updating them", async () => {
    const t = convexTest(schema, modules);
    const legacy = { ...chapter, updatedAt: 100 };
    const id = await t.run((ctx) => ctx.db.insert("verseCache", legacy));
    const original = await t.run((ctx) => ctx.db.get(id));
    await t.mutation(api.cache.upsertChapterBundle, { ...chapter, fetchedAt: 200 });
    await t.mutation(api.cache.upsertChapterBundle, { ...chapter, chapter: 2, reference: "1 Nephi 2" });
    expect(await t.run((ctx) => ctx.db.query("verseCache").collect())).toEqual([original]);
  });
});
