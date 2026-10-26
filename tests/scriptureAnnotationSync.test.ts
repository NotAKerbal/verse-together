import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { COME_FOLLOW_ME_WEEKS } from "../src/lib/comeFollowMe";
import { browseChapterHref } from "../src/lib/browseRoutes";
import { normalizeScriptureVolume, toScriptureVolumeUrlSlug } from "../src/lib/scriptureVolumes";
import { scriptureCatalog } from "../src/lib/scriptureCatalog";
import {
  annotationChapter,
  deviceChapterAnnotations,
  quickMarkPatch,
  selectionMarks,
  type ChapterAnnotations,
} from "../src/features/annotations/verseAnnotations";
import { collectChapterAnnotations, selectionMarkWrites } from "../src/features/comeFollowMe/scriptureAnnotations";
import { DeviceStudyStore } from "../src/features/notes/deviceStudy";
import { newBackend, signInAs } from "./convexAuthHarness";

/*
  The Come, Follow Me scripture pane and the standard chapter reader show one set of verse annotations: the
  same rows, under the same identity, in the same guest store and the same account query. The pane names a
  book by its canonical volume ("doctrineandcovenants", "oldtestament"); the reader by its URL slug ("dnc").
*/

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

/** The volume, book, and chapter the standard reader is given for a chapter URL (its page passes the URL slug). */
function readerRoute(href: string) {
  const [, browse, volume, book, chapter] = href.split("/");
  expect(browse).toBe("browse");
  return { volume: toScriptureVolumeUrlSlug(normalizeScriptureVolume(volume)), book, chapter: Number(chapter) };
}

// The pane's book, as StudyCompanion receives it, and the reader's props for the same chapter.
const cfmDnc = { label: "Doctrine and Covenants", slug: "doctrineandcovenants", volume: "doctrineandcovenants" };
const readerDnc = { volume: "dnc", book: "doctrineandcovenants", chapter: 4 };
const cfmIsaiah = { label: "Isaiah", slug: "isaiah", volume: "oldtestament" };
const readerIsaiah = { volume: "oldtestament", book: "isaiah", chapter: 53 };

/** The pane's view of one chapter (as useScriptureAnnotations builds it from the device store). */
function paneRows(store: DeviceStudyStore, book: typeof cfmDnc, chapter: number) {
  const result = deviceChapterAnnotations(store.getSnapshot().annotations, annotationChapter(book.volume, book.slug, chapter));
  return collectChapterAnnotations([chapter], { [String(chapter)]: result }).rows;
}

/** The reader's view of one chapter (as useChapterAnnotations builds it for a guest). */
function readerRows(store: DeviceStudyStore, route: typeof readerDnc): ChapterAnnotations["by_verse"] {
  return deviceChapterAnnotations(store.getSnapshot().annotations, annotationChapter(route.volume, route.book, route.chapter)).by_verse;
}

describe("one verse identity for both readers", () => {
  test("every Come, Follow Me chapter is stored under the identity the standard reader reads for its URL", () => {
    let chapters = 0;
    for (const week of COME_FOLLOW_ME_WEEKS) {
      for (const ref of [...week.refs, ...(week.suggestion ? [week.suggestion.ref] : [])]) {
        expect(scriptureCatalog.getBook(normalizeScriptureVolume(ref.volume), ref.book), `${ref.volume}/${ref.book}`).not.toBeNull();
        for (let chapter = ref.from; chapter <= ref.to; chapter += 1) {
          const route = readerRoute(browseChapterHref(ref.volume, ref.book, chapter));
          expect(annotationChapter(ref.volume, ref.book, chapter)).toEqual(annotationChapter(route.volume, route.book, route.chapter));
          chapters += 1;
        }
      }
    }
    expect(chapters).toBeGreaterThan(100);
  });

  test("Doctrine and Covenants: the pane's canonical volume and the reader's dnc are one identity", () => {
    expect(readerRoute(browseChapterHref("doctrineandcovenants", "doctrineandcovenants", 4))).toEqual(readerDnc);
    const pane = annotationChapter(cfmDnc.volume, cfmDnc.slug, 4);
    expect(pane).toEqual({ volume: "dnc", book: "doctrineandcovenants", chapter: 4 });
    expect(annotationChapter(readerDnc.volume, readerDnc.book, readerDnc.chapter)).toEqual(pane);
    expect(selectionMarkWrites(cfmDnc, [{ chapter: 4, verse: 2 }])).toEqual([{ target: pane, verses: [2] }]);
    expect(annotationChapter("old-testament", "isaiah", 53)).toEqual(annotationChapter("oldtestament", "isaiah", 53));
  });
});

describe("a guest's annotations, between the pane and the reader", () => {
  test("pane → reader: quick marks and a note made in the pane show in the reader, also after reload", () => {
    const disk = storage();
    const pane = new DeviceStudyStore(() => disk);
    // Quick marks from the pane's selection menu (its writes), then the full editor's note on the same verse.
    for (const { target, verses } of selectionMarkWrites(cfmDnc, [{ chapter: 4, verse: 2 }, { chapter: 4, verse: 3 }])) {
      pane.setVerseMarks(target, verses, quickMarkPatch({ kind: "highlight", color: "red" }, selectionMarks([])));
      pane.setVerseMarks(target, verses, { underlineColor: "blue" });
    }
    pane.saveAnnotation({ volume: cfmDnc.volume, book: cfmDnc.slug, chapter: 4, verse: 2 }, "Pane note", {
      highlightColor: "red",
      underlineColor: "blue",
    });
    const reader = new DeviceStudyStore(() => disk);
    reader.refresh();
    const byVerse = readerRows(reader, readerDnc);
    expect(byVerse[2]).toEqual([expect.objectContaining({ body: "Pane note", highlight_color: "red", underline: true, underline_color: "blue" })]);
    expect(byVerse[3]).toEqual([expect.objectContaining({ body: "", highlight_color: "red", underline_color: "blue" })]);
    expect(reader.getSnapshot().annotations).toHaveLength(2);
  });

  test("reader → pane: an edit, a quick mark, and a removal in the reader show in the pane, keeping notes", () => {
    const disk = storage();
    const store = new DeviceStudyStore(() => disk);
    store.saveAnnotation({ volume: cfmDnc.volume, book: cfmDnc.slug, chapter: 4, verse: 2 }, "Pane note", { highlightColor: "yellow" });
    store.setVerseMarks(annotationChapter(cfmDnc.volume, cfmDnc.slug, 4), [5], { underlineColor: "green" });
    // The reader's full editor, on its own route identity: note edited, highlight and underline recolored.
    store.saveAnnotation({ ...readerDnc, verse: 2 }, "Reader edit", { highlightColor: "purple", underlineColor: "red" });
    // The reader's quick mark takes off the highlight only; the note stays.
    store.setVerseMarks(annotationChapter(readerDnc.volume, readerDnc.book, 4), [2], { highlightColor: null });
    // The reader removes verse 5's annotation.
    const verse5 = readerRows(store, readerDnc)[5][0];
    store.remove("annotations", verse5.id);
    const reopened = new DeviceStudyStore(() => disk);
    reopened.refresh();
    const rows = paneRows(reopened, cfmDnc, 4);
    expect(rows.get("4:2")).toEqual([expect.objectContaining({ body: "Reader edit", highlight_color: null, underline_color: "red" })]);
    expect(rows.has("4:5")).toBe(false);
    expect(reopened.getSnapshot().annotations).toHaveLength(1);
  });
});

describe("an account's annotations, between the pane and the reader", () => {
  test("both directions go through one row per verse, notes shared with marks", async () => {
    const t = newBackend();
    const alice = (await signInAs(t, "alice")).as;
    const paneTarget = annotationChapter(cfmIsaiah.volume, cfmIsaiah.slug, 53);
    const readerTarget = annotationChapter(readerIsaiah.volume, readerIsaiah.book, readerIsaiah.chapter);
    // Pane: quick marks on 4–5, then a note on 4 from the full editor (which sends the marks it shows).
    for (const { target, verses } of selectionMarkWrites(cfmIsaiah, [{ chapter: 53, verse: 4 }, { chapter: 53, verse: 5 }])) {
      await alice.mutation(api.annotations.setVerseMarks, { ...target, verses, highlightColor: "green" });
      await alice.mutation(api.annotations.setVerseMarks, { ...target, verses, underlineColor: "pink" });
    }
    await alice.mutation(api.annotations.upsertVerseAnnotation, {
      ...paneTarget,
      verse: 4,
      body: "Borne our griefs",
      highlightColor: "green",
      underline: true,
      underlineColor: "pink",
    });
    // The reader's subscription (same query, its own identity) sees exactly that.
    let readerView = (await alice.query(api.annotations.getChapterAnnotations, readerTarget)).by_verse;
    expect(readerView[4]).toEqual([expect.objectContaining({ body: "Borne our griefs", highlight_color: "green", underline_color: "pink" })]);
    expect(readerView[5]).toEqual([expect.objectContaining({ body: "", highlight_color: "green", underline_color: "pink" })]);
    // Reader: a quick mark off (note kept), and a removal.
    await alice.mutation(api.annotations.setVerseMarks, { ...readerTarget, verses: [4], underline: false });
    await alice.mutation(api.annotations.deleteVerseAnnotation, { annotationId: readerView[5][0].id as Id<"verseAnnotations"> });
    const paneView = (await alice.query(api.annotations.getChapterAnnotations, paneTarget)).by_verse;
    expect(paneView[4]).toEqual([expect.objectContaining({ body: "Borne our griefs", highlight_color: "green", underline: false })]);
    expect(paneView[5]).toBeUndefined();
    readerView = (await alice.query(api.annotations.getChapterAnnotations, readerTarget)).by_verse;
    expect(readerView).toEqual(paneView);
    expect(await t.run((ctx) => ctx.db.query("verseAnnotations").collect())).toHaveLength(1);
  });

  test("Doctrine and Covenants: a note saved on dnc reads from the pane's canonical volume", async () => {
    const t = newBackend();
    const alice = (await signInAs(t, "alice")).as;
    await alice.mutation(api.annotations.upsertVerseAnnotation, {
      ...annotationChapter(readerDnc.volume, readerDnc.book, 4),
      verse: 2,
      body: "Serve him",
      highlightColor: "blue",
    });
    const pane = await alice.query(api.annotations.getChapterAnnotations, annotationChapter(cfmDnc.volume, cfmDnc.slug, 4));
    expect(pane.by_verse[2]).toEqual([expect.objectContaining({ body: "Serve him", highlight_color: "blue" })]);
  });
});
