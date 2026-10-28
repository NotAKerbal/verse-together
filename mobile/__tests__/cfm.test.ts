import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import type { Block, NativeGuide, Run } from "../src/cfm/guideTypes";
import { getNativeGuide, nativeGuides, PUBLISHED_GUIDES } from "../src/cfm/guides";
import { getChapter } from "../src/data/scripture";
import { PUBLIC_IMAGES } from "../src/generated/images";
import {
  COME_FOLLOW_ME_WEEKS,
  getLessonCover,
  getLessonOverview,
  readingGroups,
  scriptureCatalog,
} from "../src/shared/web";

const repo = path.resolve(__dirname, "../..");

function walk(blocks: Block[], visit: (run: Run) => void, figures: (image: string) => void) {
  for (const block of blocks) {
    if (block.kind === "heading") [...block.runs, ...(block.title ?? []), ...(block.refRuns ?? [])].forEach(visit);
    else if (block.kind === "p") block.runs.forEach(visit);
    else if (block.kind === "list") block.items.forEach((item) => walk(item, visit, figures));
    else if (block.kind === "quote") walk(block.blocks, visit, figures);
    else if (block.kind === "table") block.rows.forEach((row) => row.cells.forEach((cell) => cell.forEach(visit)));
    else if (block.kind === "figure") figures(block.image);
    else if (block.kind === "sources") block.items.forEach((item) => item.forEach(visit));
  }
}

describe("generated study guides", () => {
  const guides = nativeGuides();

  it("matches every published guide's checked-in Markdown", () => {
    expect(guides.map((guide) => guide.slug).sort()).toEqual(PUBLISHED_GUIDES.map((guide) => guide.slug).sort());
    for (const guide of guides) {
      const markdown = fs.readFileSync(path.join(repo, "content/cfm", `${guide.slug}.md`), "utf8");
      expect(createHash("sha256").update(markdown).digest("hex")).toBe(guide.sha256);
    }
  });

  it("pairs commentary with real verses and keeps every link resolvable", () => {
    for (const guide of guides) {
      expect(guide.range.entries.map((entry) => entry.key)).toEqual(guide.range.chapters);
      for (const entry of guide.range.entries) {
        const verses = getChapter(entry.volume, entry.slug, entry.chapter)?.verses ?? [];
        expect(verses.length).toBeGreaterThan(0);
        const section = guide.sections.find((item) => item.chapter === entry.key);
        const groups = readingGroups(verses, (section?.blocks ?? []) as never);
        // Every verse appears exactly once in the scripture-first reading.
        expect(groups.flatMap((group) => group.verses.map((verse) => verse.verse))).toEqual(verses.map((verse) => verse.verse));
        for (const block of section?.blocks ?? []) {
          if (block.passage) expect(block.passage.last).toBeLessThanOrEqual(verses.length);
        }
      }
      let refs = 0;
      walk(
        allBlocks(guide),
        (run) => {
          if (!run.ref) return;
          refs++;
          const book = scriptureCatalog.getBook(run.ref.volume, run.ref.book);
          expect(book).toBeTruthy();
          expect(run.ref.chapter).toBeLessThanOrEqual(book!.chapterCount);
          // A link the lesson scrolls to is one of its own chapters, in its own book.
          if (run.ref.local) expect(guide.range.entries.some((entry) => entry.volume === run.ref!.volume && entry.slug === run.ref!.book && entry.chapter === run.ref!.chapter)).toBe(true);
        },
        (image) => expect(PUBLIC_IMAGES[image]).toBeDefined()
      );
      expect(refs).toBeGreaterThan(20);
    }
  });
});

function allBlocks(guide: NativeGuide): Block[] {
  return [...guide.introduction, ...guide.closing, ...guide.sections.flatMap((section) => [...section.heading, ...section.blocks.flatMap((block) => [...block.preview, ...block.more])])];
}

function runsOf(blocks: Block[]): Run[] {
  const runs: Run[] = [];
  walk(blocks, (run) => runs.push(run), () => {});
  return runs;
}

describe("the October 26 guide (Jeremiah 31–33; 36–39; Lamentations 1; 3)", () => {
  const guide = getNativeGuide("2026-10-26")!;

  it("is bundled from the published Markdown, with its cover", () => {
    expect(guide).toMatchObject({
      slug: "2026-10-26-jeremiah-31-33-36-39-lamentations-1-3",
      title: "I Will Turn Their Mourning into Joy",
      scripture: "Jeremiah 31–33; 36–39; Lamentations 1; 3",
      endDate: "2026-11-01",
      sha256: "e6c3e669c181420edafae9da5ba1a5fc9ed38deaff921d7c7008e5806f43b237",
    });
    expect(getLessonCover("2026-10-26").src).toBe("/cfm/covers/rembrandt-jeremiah.webp");
    expect(PUBLIC_IMAGES["cfm/covers/rembrandt-jeremiah.webp"]).toBeDefined();
  });

  it("reads both books in order, each chapter in its own book", () => {
    expect(guide.range.entries.map((entry) => `${entry.slug} ${entry.chapter}`)).toEqual([
      "jeremiah 31", "jeremiah 32", "jeremiah 33", "jeremiah 36", "jeremiah 37", "jeremiah 38", "jeremiah 39", "lamentations 1", "lamentations 3",
    ]);
    // Jeremiah 34–35 and Lamentations 2 are skipped, not read as the wrong book.
    expect(guide.range.entries.some((entry) => entry.slug === "lamentations" && entry.chapter === 2)).toBe(false);
    expect(new Set(guide.range.entries.map((entry) => entry.key)).size).toBe(9);
  });

  it("shows all 297 assigned verses once, in book and chapter order, with commentary for each chapter", () => {
    const shown: string[] = [];
    for (const entry of guide.range.entries) {
      const verses = getChapter(entry.volume, entry.slug, entry.chapter)!.verses;
      const section = guide.sections.find((item) => item.chapter === entry.key);
      expect(section).toBeTruthy();
      expect(section!.blocks.filter((block) => block.passage).length).toBeGreaterThan(3);
      for (const group of readingGroups(verses, section!.blocks as never)) shown.push(...group.verses.map((verse) => `${entry.slug} ${entry.chapter}:${verse.verse}`));
    }
    expect(shown).toHaveLength(297);
    expect(new Set(shown).size).toBe(297);
    expect(shown[0]).toBe("jeremiah 31:1");
    expect(shown[208]).toBe("jeremiah 39:18");
    expect(shown[209]).toBe("lamentations 1:1");
    expect(shown[230]).toBe("lamentations 1:22");
    expect(shown[231]).toBe("lamentations 3:1");
    expect(shown[296]).toBe("lamentations 3:66");
  });

  it("links Lamentations passages to Lamentations, and keeps its intro, closing and sources", () => {
    const lamentations3 = guide.sections.find((item) => item.chapter === guide.range.entries[8].key)!;
    const local = runsOf([...lamentations3.heading, ...lamentations3.blocks.flatMap((block) => [...block.preview, ...block.more])]).filter((run) => run.ref?.local);
    expect(local.length).toBeGreaterThan(5);
    // Each passage link goes to the book it names ("Lamentations 3:22" never to Jeremiah 3); a bare "3:22" is the section's.
    for (const run of local) {
      if (/^\d/.test(run.text)) expect(run.ref).toMatchObject({ book: "lamentations", chapter: 3 });
      else expect(run.ref!.book).toBe(run.text.startsWith("Jeremiah") ? "jeremiah" : "lamentations");
    }
    expect(local.filter((run) => run.text.startsWith("Lamentations 3:") && run.ref!.book === "lamentations" && run.ref!.chapter === 3).length).toBeGreaterThan(5);
    const lamentationsRefs = runsOf(allBlocks(guide)).filter((run) => run.ref?.book === "lamentations");
    expect(lamentationsRefs.length).toBeGreaterThan(20);
    expect(lamentationsRefs.every((run) => run.ref!.chapter === 2 ? !run.ref!.local : run.ref!.local)).toBe(true);

    expect(guide.toc.filter((item) => item.kind === "chapter").map((item) => [item.text.split(":")[0], item.key])).toEqual([
      ["Jeremiah 31", 31], ["Jeremiah 32", 32], ["Jeremiah 33", 33], ["Jeremiah 36", 36], ["Jeremiah 37", 37], ["Jeremiah 38", 38], ["Jeremiah 39", 39],
      ["Lamentations 1", guide.range.entries[7].key], ["Lamentations 3", guide.range.entries[8].key],
    ]);
    expect(guide.toc.map((item) => item.text)).toEqual(expect.arrayContaining(["Historical and Literary Context", "Significant Insights", "Weekly Study and Discussion Plan", "Public Sources"]));
    expect(runsOf(guide.introduction).map((run) => run.text).join("")).toMatch(/Lamentations/);
    expect(runsOf(guide.closing).filter((run) => run.url).length).toBeGreaterThan(3);
  });
});

describe("lesson schedule", () => {
  it("shows this week's guide and the published guides before it", () => {
    const overview = getLessonOverview("2026-10-27", PUBLISHED_GUIDES);
    expect(overview.current).toMatchObject({ start: "2026-10-26", title: "I Will Turn Their Mourning into Joy", href: "/come-follow-me/2026-10-26" });
    expect(overview.current?.guide?.slug).toBe("2026-10-26-jeremiah-31-33-36-39-lamentations-1-3");
    expect(overview.previous.map((lesson) => lesson.start)).toEqual(["2026-10-19", "2026-10-12", "2026-10-05", "2026-09-28"]);
    expect(overview.previous[0].href).toBe("/come-follow-me/2026-10-19");
    expect(overview.upcoming).toEqual([]);
  });

  it("keeps earlier weeks on their own guides and later weeks on the schedule", () => {
    const lastWeek = getLessonOverview("2026-10-20", PUBLISHED_GUIDES);
    expect(lastWeek.current).toMatchObject({ start: "2026-10-19", title: "Before I Formed Thee in the Belly I Knew Thee" });
    expect(lastWeek.upcoming.map((lesson) => lesson.start)).toEqual(["2026-10-26"]);
    // Its last day (Sunday) is still this guide's week.
    expect(getLessonOverview("2026-11-01", PUBLISHED_GUIDES).current?.start).toBe("2026-10-26");
    const nextWeek = getLessonOverview("2026-11-03", PUBLISHED_GUIDES);
    expect(nextWeek.current).toMatchObject({ start: "2026-11-02", guide: null });
    expect(nextWeek.previous[0]).toMatchObject({ start: "2026-10-26", href: "/come-follow-me/2026-10-26" });
  });

  it("has a bundled cover for every scheduled week", () => {
    for (const week of COME_FOLLOW_ME_WEEKS) expect(PUBLIC_IMAGES[getLessonCover(week.start).src.slice(1)]).toBeDefined();
  });
});
