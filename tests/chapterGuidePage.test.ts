// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const convex = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
const companion = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("@/lib/convexHttp", () => ({ convexQuery: convex.query, convexMutation: convex.mutation }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/features/comeFollowMe/LessonNoteButton", () => ({ default: () => null }));
vi.mock("@/features/notes/NoteSourceRegistrar", () => ({ default: () => null }));
vi.mock("@/features/comeFollowMe/StudyCompanion", () => ({
  default: (props: Record<string, unknown>) => {
    companion.props = props;
    return props.footer;
  },
}));
vi.mock("@/lib/ldsLocalData.server", () => ({
  getLocalLdsChapter: async (volume: string, book: string, chapter: number) =>
    volume === "bookofmormon" && book === "1nephi" && chapter === 1
      ? { reference: "1 Nephi 1", verses: Array.from({ length: 3 }, (_, index) => ({ verse: index + 1, text: `Verse ${index + 1}.` })) }
      : null,
}));

const { default: ChapterGuidePage, generateMetadata, dynamic } = await import("../src/app/chapter-guides/[volume]/[book]/[chapter]/page");

const STORED = {
  reference: "1 Nephi 1",
  content: {
    title: "1 Nephi 1: A record begins",
    overview: ["Overview."],
    historical_context: { paragraphs: ["Context."], source_ids: [] },
    significant_insights: [],
    passages: [{ verse_start: 1, verse_end: 3, heading: "Heading", original_meaning: ["Meaning."], latter_day_saint_application: [], cross_references: [], questions: ["Why?"], source_ids: [] }],
    source_use: [],
    limitations: [],
  },
  sources: [],
  provenance: { researchModel: "gpt-5.6-luna", writerModel: "claude-opus-5-5", reviewModel: "gpt-5.6-terra", promptVersion: 1, requiredCorrections: 1, repaired: true, reviewSummary: "internal summary", unverifiable: ["internal"] },
  generatedAt: Date.UTC(2026, 10, 4),
};

const params = (volume = "bookofmormon", book = "1nephi", chapter = "1") => ({ params: Promise.resolve({ volume, book, chapter }) });

beforeEach(() => {
  convex.query.mockReset();
  convex.mutation.mockReset();
  companion.props = null;
});

describe("the full chapter guide page", () => {
  test("anyone can read it, from the saved guide only", async () => {
    convex.query.mockResolvedValue({ guide: STORED, generating: null, availability: null });
    const html = renderToStaticMarkup(await ChapterGuidePage(params()));
    expect(convex.query).toHaveBeenCalledTimes(1);
    expect(convex.query.mock.calls[0]![0]).toBe("chapterGuides:getChapterState");
    expect(convex.mutation).not.toHaveBeenCalled();
    expect(dynamic).toBe("force-dynamic");
    expect(html).toContain("A record begins");
  });

  test("it uses the Come, Follow Me companion with its own identity, separate from lessons", async () => {
    convex.query.mockResolvedValue({ guide: STORED, generating: null, availability: null });
    renderToStaticMarkup(await ChapterGuidePage(params()));
    const props = companion.props!;
    expect(props.guideId).toBe("ai-guide-bookofmormon-1nephi-1");
    expect(props.guideSource).toEqual({ kind: "page", label: "1 Nephi 1: Chapter guide", href: "/chapter-guides/bookofmormon/1nephi/1" });
    expect((props.readerSections as Array<{ blocks: Array<{ id: string }> }>)[0]!.blocks[0]!.id).toBe("passage-1-3");
    expect((props.chapters as Array<{ key: number; slug: string; verses: unknown[] }>)[0]).toMatchObject({ key: 1, slug: "1nephi" });
    expect((props.chapters as Array<{ verses: unknown[] }>)[0]!.verses).toHaveLength(3);
  });

  test("the footer holds a truthful label and the details, with no internal review text or raw model ids", async () => {
    convex.query.mockResolvedValue({ guide: STORED, generating: null, availability: null });
    const html = renderToStaticMarkup(await ChapterGuidePage(params()));
    expect(html).toContain("Prepared with AI");
    expect(html).toContain("No person has reviewed it");
    expect(html).toContain("isn’t a Come, Follow Me lesson");
    expect(html).toContain("How this guide was made");
    expect(html).toContain("OpenAI GPT-5.6 Luna chose its own web searches");
    expect(html).toContain("didn’t see the source pages");
    expect(html).toContain("run in a fixed order");
    expect(html).toContain("weren’t checked against their wording");
    expect(html).not.toContain("internal summary");
    expect(html).not.toMatch(/gpt-5\.6-|claude-opus-/);
  });

  test("the hero names the chapter and a plain chapter guide, with AI credited only in the footer", async () => {
    convex.query.mockResolvedValue({ guide: STORED, generating: null, availability: null });
    const html = renderToStaticMarkup(await ChapterGuidePage(params()));
    expect(html).toContain("<span>1 Nephi 1</span><span>Chapter guide</span>");
    expect(html).not.toContain("AI-generated");
    expect(html.indexOf("Prepared with AI")).toBeGreaterThan(html.indexOf("<footer"));
  });

  test("the footer reports how many cited scriptures the reviewer could read", async () => {
    convex.query.mockResolvedValue({ guide: { ...STORED, provenance: { ...STORED.provenance, crossReferencesChecked: 12, crossReferencesUnchecked: 3 } }, generating: null, availability: null });
    const html = renderToStaticMarkup(await ChapterGuidePage(params()));
    expect(html).toContain("given the text of 12 of the 15 scriptures");
  });

  test("with no saved guide, nothing is generated and the reader is offered", async () => {
    convex.query.mockResolvedValue({ guide: null, generating: null, availability: "available" });
    const html = renderToStaticMarkup(await ChapterGuidePage(params()));
    expect(html).toContain("no chapter guide for 1 Nephi 1 yet");
    expect(html).not.toContain("AI-generated");
    expect(html).toContain('href="/browse/bookofmormon/1nephi/1"');
    expect(convex.mutation).not.toHaveBeenCalled();
    expect(companion.props).toBeNull();
  });

  test("a backend failure is a readable page", async () => {
    convex.query.mockRejectedValue(new Error("down"));
    const html = renderToStaticMarkup(await ChapterGuidePage(params()));
    expect(html).toContain("temporarily unavailable");
  });

  test.each([
    ["an unknown book", params("bookofmormon", "nope", "1")],
    ["a chapter the book lacks", params("bookofmormon", "1nephi", "99")],
    ["the wrong volume", params("oldtestament", "1nephi", "1")],
    ["a malformed chapter", params("bookofmormon", "1nephi", "1;drop")],
  ])("%s is not found, and reads nothing", async (_name, input) => {
    await expect(ChapterGuidePage(input)).rejects.toThrow("NOT_FOUND");
    expect(convex.query).not.toHaveBeenCalled();
  });

  test("search engines are asked not to index it", async () => {
    const metadata = await generateMetadata(params());
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toBe("1 Nephi 1 · Chapter guide · Verse Together");
  });
});
