import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FALLBACK_COVER, getLessonCover, lessonCoverWeeks, shortCoverCredit } from "./lessonCovers.ts";
import { formatLessonDates, getLessonForWeek, getLessonOverview, weekReading } from "./lessons.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const guides = JSON.parse(fs.readFileSync(path.join(root, "content/cfm/guides.json"), "utf8"));
const starts = (lessons) => lessons.map((lesson) => lesson.start);

test("this week is the guide whose own dates include today, with earlier guides newest first", () => {
  for (const today of ["2026-10-19", "2026-10-23", "2026-10-25"]) {
    const overview = getLessonOverview(today, guides);
    assert.equal(overview.schedule, "during");
    assert.equal(overview.current.start, "2026-10-19", today);
    assert.equal(overview.current.guide.slug, "2026-10-19-jeremiah-1-3-7-16-18-20");
    assert.equal(overview.current.href, "/come-follow-me/2026-10-19");
    assert.deepEqual(starts(overview.previous), ["2026-10-12", "2026-10-05", "2026-09-28"]);
    assert.deepEqual(starts(overview.upcoming), ["2026-10-26", "2026-11-02", "2026-11-09"]);
  }
});

test("a guide published for this week is featured with its own title and painting", () => {
  for (const today of ["2026-10-26", "2026-10-28", "2026-11-01"]) {
    const overview = getLessonOverview(today, guides);
    const { current } = overview;
    assert.equal(overview.schedule, "during");
    assert.equal(current.start, "2026-10-26", today);
    assert.equal(current.guide.slug, "2026-10-26-jeremiah-31-33-36-39-lamentations-1-3");
    assert.equal(current.title, "I Will Turn Their Mourning into Joy");
    assert.equal(current.dateLabel, "October 26–November 1, 2026");
    assert.equal(current.href, "/come-follow-me/2026-10-26");
    assert.notEqual(current.cover, FALLBACK_COVER);
    assert.equal(current.cover.kind, "painting");
    assert.equal(current.cover.credit.sourceUrl, "https://commons.wikimedia.org/wiki/File:Rembrandt_-_Jeremiah_lamenting.jpg");
    assert.deepEqual(starts(overview.previous), ["2026-10-19", "2026-10-12", "2026-10-05", "2026-09-28"]);
    assert.deepEqual(starts(overview.upcoming), ["2026-11-02", "2026-11-09"]);
  }
  // The guide does not change the week's mixed-book reading.
  assert.deepEqual(
    weekReading(getLessonOverview("2026-10-28", guides).current.week).map((range) => `${range.book} ${range.from}-${range.to}`),
    ["jeremiah 31-33", "jeremiah 36-39", "lamentations 1-1", "lamentations 3-3"]
  );
});

test("the November 2 guide is featured for its own week, with the October 26 guide before it", () => {
  for (const today of ["2026-11-02", "2026-11-05", "2026-11-08"]) {
    const overview = getLessonOverview(today, guides);
    const { current } = overview;
    assert.equal(overview.schedule, "during");
    assert.equal(current.start, "2026-11-02", today);
    assert.equal(current.guide.slug, "2026-11-02-ezekiel-1-3-33-34-36-37-47");
    assert.equal(current.title, "A New Spirit Will I Put within You");
    assert.equal(current.dateLabel, "November 2–8, 2026");
    assert.equal(current.href, "/come-follow-me/2026-11-02");
    assert.notEqual(current.cover, FALLBACK_COVER);
    assert.equal(current.cover.kind, "painting");
    assert.equal(current.cover.src, "/cfm/art/tissot-good-shepherd.webp");
    assert.equal(current.cover.credit.sourceUrl, "https://commons.wikimedia.org/wiki/File:Brooklyn_Museum_-_The_Good_Shepherd_(Le_bon_pasteur)_-_James_Tissot_-_overall.jpg");
    assert.deepEqual(current.cover, getLessonCover("2026-11-02"));
    assert.deepEqual(starts(overview.previous), ["2026-10-26", "2026-10-19", "2026-10-12", "2026-10-05", "2026-09-28"]);
    assert.deepEqual(starts(overview.upcoming), ["2026-11-09"]);
  }
  assert.deepEqual(
    weekReading(getLessonOverview("2026-11-04", guides).current.week).map((range) => `${range.book} ${range.from}-${range.to}`),
    ["ezekiel 1-3", "ezekiel 33-34", "ezekiel 36-37", "ezekiel 47-47"]
  );
});

test("the November 9 guide is featured for its own week, with the November 2 guide before it", () => {
  for (const today of ["2026-11-09", "2026-11-11", "2026-11-15"]) {
    const overview = getLessonOverview(today, guides);
    const { current } = overview;
    assert.equal(overview.schedule, "during");
    assert.equal(current.start, "2026-11-09", today);
    assert.equal(current.guide.slug, "2026-11-09-daniel-1-7");
    assert.equal(current.title, "There Is No Other God That Can Deliver");
    assert.equal(current.dateLabel, "November 9–15, 2026");
    assert.equal(current.href, "/come-follow-me/2026-11-09");
    assert.notEqual(current.cover, FALLBACK_COVER);
    assert.equal(current.cover.kind, "painting");
    assert.equal(current.cover.src, "/cfm/covers/riviere-daniels-answer.webp");
    assert.equal(current.cover.credit.sourceUrl, "https://commons.wikimedia.org/wiki/File:Daniel%27s_Answer_to_the_King,_by_Briton_Riviere,_GMIII_MCAG_1937_123-001.jpg");
    assert.deepEqual(current.cover, getLessonCover("2026-11-09"));
    assert.deepEqual(starts(overview.previous), ["2026-11-02", "2026-10-26", "2026-10-19", "2026-10-12", "2026-10-05", "2026-09-28"]);
    assert.deepEqual(overview.upcoming, []);
  }
  assert.deepEqual(
    weekReading(getLessonOverview("2026-11-11", guides).current.week).map((range) => `${range.book} ${range.from}-${range.to}`),
    ["daniel 1-7"]
  );
});

test("a scheduled week without a guide is featured as its reading, never as the latest guide", () => {
  const overview = getLessonOverview("2026-11-18", guides);
  const { current } = overview;
  assert.equal(current.start, "2026-11-16");
  assert.equal(current.guide, null);
  assert.equal(current.title, "Hosea 1–6; 10–14; Joel");
  assert.equal(current.dateLabel, "November 16–22, 2026");
  assert.equal(current.href, "/come-follow-me/2026-11-16");
  assert.equal(current.cover, FALLBACK_COVER);
  assert.deepEqual(
    weekReading(current.week).map((range) => `${range.book} ${range.from}-${range.to}`),
    ["hosea 1-6", "hosea 10-14", "joel 1-3"]
  );
  assert.deepEqual(starts(overview.previous), ["2026-11-09", "2026-11-02", "2026-10-26", "2026-10-19", "2026-10-12", "2026-10-05", "2026-09-28"]);
  assert.deepEqual(overview.upcoming, []);
});

test("special weeks fall back to their suggested reading", () => {
  const { current } = getLessonOverview("2026-12-25", guides);
  assert.equal(current.title, "Christmas");
  assert.deepEqual(weekReading(current.week), [{ volume: "oldtestament", book: "isaiah", from: 9, to: 9 }]);
});

test("outside the schedule nothing is called this week", () => {
  const after = getLessonOverview("2027-02-01", guides);
  assert.equal(after.schedule, "after");
  assert.equal(after.current, null);
  assert.deepEqual(starts(after.previous), ["2026-11-09", "2026-11-02", "2026-10-26", "2026-10-19", "2026-10-12", "2026-10-05", "2026-09-28"]);

  const before = getLessonOverview("2025-11-03", guides);
  assert.equal(before.schedule, "before");
  assert.equal(before.current, null);
  assert.deepEqual(before.previous, []);
  assert.deepEqual(starts(before.upcoming), ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
});

test("a guide published ahead of its week is upcoming, not current", () => {
  const overview = getLessonOverview("2026-10-15", guides);
  assert.equal(overview.current.start, "2026-10-12");
  assert.deepEqual(starts(overview.upcoming), ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
  assert.deepEqual(starts(overview.previous), ["2026-10-05", "2026-09-28"]);
});

test("every published guide has its own cover and study page", () => {
  for (const guide of guides) {
    const lesson = getLessonForWeek(guide.startDate, guides);
    assert.equal(lesson.href, `/come-follow-me/${guide.startDate}`, guide.slug);
    assert.notEqual(lesson.cover, FALLBACK_COVER, `${guide.slug} needs a cover in lessonCovers.ts`);
  }
  assert.equal(getLessonForWeek("2027-01-04", guides), null);
});

test("covers exist, have alt text, and credit every painting in full", () => {
  for (const cover of [FALLBACK_COVER, ...lessonCoverWeeks().map(getLessonCover)]) {
    assert.ok(fs.existsSync(path.join(root, "public", cover.src)), cover.src);
    assert.ok(cover.alt.length > 20, cover.src);
    assert.ok(cover.width > 0 && cover.height > 0, cover.src);
    if (cover.kind === "painting") {
      const { title, artist, date, license, sourceUrl } = cover.credit;
      assert.ok(title && artist && date && license, cover.src);
      assert.match(sourceUrl, /^https:\/\//);
      assert.equal(shortCoverCredit(cover), `${artist}, ${title}`);
    } else {
      // Generated covers are landscapes and objects only: never a person, and never the Savior.
      assert.match(cover.src, /^\/cfm\/covers\//);
      assert.doesNotMatch(cover.alt, /\b(Jesus|Christ|Savior|Saviour|Lord|God|angel|man|woman|person|people|figure)\b/i);
      assert.equal(shortCoverCredit(cover), null);
    }
  }
});

test("lessons depicting the Savior use the historical paintings", () => {
  assert.equal(getLessonCover("2026-10-05").credit.artist, "Carl Bloch");
  assert.equal(getLessonCover("2026-09-28").credit.artist, "James Tissot");
  for (const week of lessonCoverWeeks()) {
    const cover = getLessonCover(week);
    if (/\b(Jesus|Christ|Savior)\b/.test(cover.alt)) assert.equal(cover.kind, "painting", week);
  }
});

test("lesson dates read like the guides' own labels", () => {
  assert.equal(formatLessonDates("2026-10-19", "2026-10-25"), "October 19–25, 2026");
  assert.equal(formatLessonDates("2026-09-28", "2026-10-04"), "September 28–October 4, 2026");
  assert.equal(formatLessonDates("2025-12-29", "2026-01-04"), "December 29, 2025–January 4, 2026");
  for (const guide of guides) assert.equal(formatLessonDates(guide.startDate, guide.endDate), guide.dateLabel);
});

test("the October 26 cover is Rembrandt's Jeremiah, a public-domain painting credited in full", () => {
  const cover = getLessonCover("2026-10-26");
  assert.equal(cover.kind, "painting");
  assert.deepEqual([cover.src, cover.width, cover.height, cover.focus], ["/cfm/covers/rembrandt-jeremiah.webp", 1180, 1500, "50% 38%"]);
  assert.deepEqual(cover.credit, {
    title: "Jeremiah Lamenting the Destruction of Jerusalem",
    artist: "Rembrandt van Rijn",
    date: "1630",
    collection: "Rijksmuseum",
    license: "Public domain",
    sourceLabel: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Rembrandt_-_Jeremiah_lamenting.jpg",
  });
  assert.doesNotMatch(cover.alt, /\b(Jesus|Christ|Savior)\b/);
  const webp = fs.readFileSync(path.join(root, "public", cover.src));
  assert.equal(webp.subarray(0, 4).toString("latin1"), "RIFF");
  assert.equal(webp.subarray(8, 12).toString("latin1"), "WEBP");
});

test("the November 9 cover is Briton Rivière's Daniel's Answer to the King, a public-domain painting credited in full", () => {
  const cover = getLessonCover("2026-11-09");
  assert.equal(cover.kind, "painting");
  assert.deepEqual([cover.src, cover.width, cover.height, cover.focus], ["/cfm/covers/riviere-daniels-answer.webp", 1200, 772, "30% 30%"]);
  assert.deepEqual(cover.credit, {
    title: "Daniel’s Answer to the King",
    artist: "Briton Rivière",
    date: "1890",
    collection: "Manchester Art Gallery",
    license: "Public domain",
    sourceLabel: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Daniel%27s_Answer_to_the_King,_by_Briton_Riviere,_GMIII_MCAG_1937_123-001.jpg",
  });
  assert.equal(shortCoverCredit(cover), "Briton Rivière, Daniel’s Answer to the King");
  assert.doesNotMatch(cover.alt, /\b(Jesus|Christ|Savior)\b/);
  const webp = fs.readFileSync(path.join(root, "public", cover.src));
  assert.equal(webp.subarray(0, 4).toString("latin1"), "RIFF");
  assert.equal(webp.subarray(8, 12).toString("latin1"), "WEBP");
});

test("the November 2 cover is James Tissot's Good Shepherd, the September 28 painting credited in full", () => {
  const cover = getLessonCover("2026-11-02");
  const shepherd = getLessonCover("2026-09-28");
  assert.equal(cover.kind, "painting");
  assert.deepEqual([cover.src, cover.width, cover.height, cover.focus], ["/cfm/art/tissot-good-shepherd.webp", 382, 713, "50% 12%"]);
  assert.deepEqual([cover.src, cover.width, cover.height, cover.focus], [shepherd.src, shepherd.width, shepherd.height, shepherd.focus]);
  assert.deepEqual(cover.credit, shepherd.credit);
  assert.deepEqual(cover.credit, {
    title: "The Good Shepherd",
    artist: "James Tissot",
    date: "1886–1894",
    collection: "Brooklyn Museum",
    license: "Public domain",
    sourceLabel: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Brooklyn_Museum_-_The_Good_Shepherd_(Le_bon_pasteur)_-_James_Tissot_-_overall.jpg",
  });
  assert.equal(shortCoverCredit(cover), "James Tissot, The Good Shepherd");
  const webp = fs.readFileSync(path.join(root, "public", cover.src));
  assert.equal(webp.subarray(0, 4).toString("latin1"), "RIFF");
  assert.equal(webp.subarray(8, 12).toString("latin1"), "WEBP");
});
