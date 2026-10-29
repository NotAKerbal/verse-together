import { getChapter, loadVolume, VOLUME_IDS } from "../src/data/scripture";
import { MAX_VERSE_RESULTS, searchScriptures } from "../src/data/search";
import { chapterPath, toAppHref, webUrl } from "../src/navigation/hrefs";
import { buildLibraryVolumes, buildVolumeBooks, scriptureCatalog } from "../src/shared/web";

describe("bundled scripture", () => {
  it("has every catalog book and chapter, with the catalog's verse counts", () => {
    for (const volume of scriptureCatalog.volumes) {
      const bundle = loadVolume(volume.volume);
      expect(bundle).not.toBeNull();
      for (const book of volume.books) {
        const bundled = bundle!.books.get(book.book);
        expect(bundled?.chapters.length).toBe(book.chapterCount);
        bundled!.chapters.forEach((chapter, index) => expect(chapter.verses.length).toBe(book.verseCounts[index]));
      }
    }
  });

  it("reads real verses by URL slug or canonical id, and refuses what does not exist", () => {
    const alma = getChapter("bookofmormon", "alma", 32);
    expect(alma?.verses[20]).toEqual({ verse: 21, text: expect.stringContaining("faith is not to have a perfect knowledge") });
    expect(getChapter("dnc", "doctrineandcovenants", 4)?.verses.length).toBe(7);
    expect(getChapter("doctrineandcovenants", "doctrineandcovenants", 4)?.verses.length).toBe(7);
    expect(getChapter("oldtestament", "genesis", 51)).toBeNull();
    expect(getChapter("oldtestament", "nope", 1)).toBeNull();
    expect(getChapter("apocrypha", "tobit", 1)).toBeNull();
  });

  it("lists the Library and books from the shared browse rules", () => {
    expect(buildLibraryVolumes(scriptureCatalog).map((volume) => volume.href)).toEqual([
      "/browse/bookofmormon",
      "/browse/oldtestament",
      "/browse/newtestament",
      "/browse/dnc/doctrineandcovenants",
      "/browse/pearl",
    ]);
    const books = buildVolumeBooks(scriptureCatalog, "bookofmormon");
    expect(books.find((book) => book.id === "enos")?.href).toBe("/browse/bookofmormon/enos/1");
    expect(books.find((book) => book.id === "alma")).toMatchObject({ href: "/browse/bookofmormon/alma", chapters: 63, category: "Mormon's Record" });
  });
});

describe("scripture search", () => {
  it("offers references for a typed reference", () => {
    const results = searchScriptures("alma 32");
    expect(results.references[0]).toMatchObject({ volume: "bookofmormon", book: "alma", chapter: 32 });
    expect(searchScriptures("1 ne 3:7").references[0]).toMatchObject({ book: "1nephi", chapter: 3, verse: 7 });
  });

  it("finds a phrase and groups matches by chapter", () => {
    const results = searchScriptures("faith is not to have a perfect knowledge");
    expect(results.verses[0]).toMatchObject({ reference: "Alma 32", matchedVerses: [21], volume: "bookofmormon" });
    expect(results.verses[0].snippets[0].snippet).toContain("perfect knowledge");
  });

  it("keeps to a volume and caps the verse matches", () => {
    const scoped = searchScriptures("charity", { volume: "pearl" });
    expect(scoped.verses.every((group) => group.volume === "pearl")).toBe(true);
    const common = searchScriptures("lord");
    expect(common.truncated).toBe(true);
    expect(common.verses.reduce((sum, group) => sum + group.matchedVerses.length, 0)).toBe(MAX_VERSE_RESULTS);
    expect(searchScriptures("   ")).toEqual({ references: [], verses: [], truncated: false });
  });
});

describe("app routes mirror the web's paths", () => {
  it("turns web fragments into screen parameters", () => {
    expect(toAppHref("/browse/bookofmormon/alma/32#v-21")).toBe("/browse/bookofmormon/alma/32?verse=21");
    expect(toAppHref("/browse/oldtestament/isaiah/53?translation=kjv#v-4")).toBe("/browse/oldtestament/isaiah/53?translation=kjv&verse=4");
    expect(toAppHref("/come-follow-me/2026-10-19#jeremiah-1")).toBe("/come-follow-me/2026-10-19?anchor=jeremiah-1");
    expect(toAppHref("/notes")).toBe("/notes");
    expect(chapterPath("doctrineandcovenants", "doctrineandcovenants", 4, 2)).toBe("/browse/dnc/doctrineandcovenants/4?verse=2");
    expect(webUrl("/share/bookofmormon/alma/32/21")).toBe("https://www.versetogether.org/share/bookofmormon/alma/32/21");
  });

  it("covers all five volumes", () => {
    expect([...VOLUME_IDS].sort()).toEqual(scriptureCatalog.volumes.map((volume) => volume.volume).sort());
  });
});
