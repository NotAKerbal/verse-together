// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const viewer = vi.hoisted(() => ({ getServerViewer: vi.fn() }));
const auth = vi.hoisted(() => ({ isChapterGuideReviewer: false }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/auth-server", () => ({ getServerViewer: viewer.getServerViewer }));
vi.mock("@/lib/ldsLocalData.server", () => ({ getLocalLdsVolumes: async () => [], getLocalLdsBooks: async () => [] }));
vi.mock("@/features/chapterGuides/ChapterGuideOwnerPanel", () => ({
  default: ({ siteSecretConfigured }: { siteSecretConfigured: boolean }) => `OWNER PANEL, site secret ${siteSecretConfigured ? "set" : "missing"}`,
}));
vi.mock("@/features/chapterGuides/ChapterGuideReviewQueue", () => ({
  default: ({ audience }: { audience: string }) => `REVIEW QUEUE FOR ${audience}`,
}));

const { default: ResourceManagerPage } = await import("../src/app/resources/manage/page");
const { default: ChapterGuideOwnerPage } = await import("../src/app/resources/manage/chapter-guides/page");
const { default: ChapterGuideReviewLink } = await import("../src/features/chapterGuides/ChapterGuideReviewLink");

const CONTROLS_LINK = 'href="/resources/manage/chapter-guides"';

beforeEach(() => {
  viewer.getServerViewer.mockReset();
  auth.isChapterGuideReviewer = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("finding the chapter guide controls", () => {
  test("an admin gets a link from the resource manager, and the workspace keeps its fixed height", async () => {
    viewer.getServerViewer.mockResolvedValue({ viewer: { isAdmin: true } });
    const html = renderToStaticMarkup(await ResourceManagerPage());
    expect(html).toContain(CONTROLS_LINK);
    expect(html).toContain('class="page-shell-wide h-full overflow-hidden');
  });

  test.each([
    ["a signed-in reader", { viewer: { isAdmin: false } }],
    ["a chapter guide reviewer", { viewer: { isAdmin: false, isChapterGuideReviewer: true } }],
    ["a signed-out visitor", { viewer: null }],
  ])("%s doesn't get the link", async (_name, response) => {
    viewer.getServerViewer.mockResolvedValue(response);
    expect(renderToStaticMarkup(await ResourceManagerPage())).not.toContain(CONTROLS_LINK);
  });

  test("the resource manager refuses a chapter guide reviewer", async () => {
    viewer.getServerViewer.mockResolvedValue({ viewer: { isAdmin: false, isChapterGuideReviewer: true } });
    const html = renderToStaticMarkup(await ResourceManagerPage());
    expect(html).toContain("only available to admins");
    expect(html).not.toContain("page-shell-wide");
  });

  test("the controls page leads an admin back to the resource manager", async () => {
    viewer.getServerViewer.mockResolvedValue({ viewer: { isAdmin: true } });
    expect(renderToStaticMarkup(await ChapterGuideOwnerPage())).toContain('href="/resources/manage"');
  });

  test.each([
    ["an admin", { isAdmin: true }],
    ["an admin who is also a reviewer", { isAdmin: true, isChapterGuideReviewer: true }],
  ])("%s gets the full owner panel", async (_name, flags) => {
    vi.stubEnv("CHAPTER_GUIDE_SERVICE_SECRET", "set-on-the-site");
    viewer.getServerViewer.mockResolvedValue({ viewer: flags });
    const html = renderToStaticMarkup(await ChapterGuideOwnerPage());
    expect(html).toContain("OWNER PANEL, site secret set");
    expect(html).not.toContain("REVIEW QUEUE");
  });

  test("the controls page shows others only a refusal and a way out", async () => {
    viewer.getServerViewer.mockResolvedValue({ viewer: { isAdmin: false } });
    const html = renderToStaticMarkup(await ChapterGuideOwnerPage());
    expect(html).toContain("only available to admins");
    expect(html).toContain('href="/browse"');
    expect(html).not.toContain("AI chapter guides");
    expect(html).not.toContain("REVIEW QUEUE");
  });

  test("a signed-out visitor gets the same refusal", async () => {
    viewer.getServerViewer.mockResolvedValue({ viewer: null });
    const html = renderToStaticMarkup(await ChapterGuideOwnerPage());
    expect(html).toContain("only available to admins");
    expect(html).not.toContain("REVIEW QUEUE");
  });
});

describe("the chapter guide reviewer's way in", () => {
  test("the page gives a reviewer only the review queue, and no site configuration", async () => {
    vi.stubEnv("CHAPTER_GUIDE_SERVICE_SECRET", "set-on-the-site");
    viewer.getServerViewer.mockResolvedValue({ viewer: { isAdmin: false, isChapterGuideReviewer: true } });
    const html = renderToStaticMarkup(await ChapterGuideOwnerPage());
    expect(html).toContain("REVIEW QUEUE FOR reviewer");
    expect(html).toContain("AI chapter guide reviews");
    expect(html).toContain('href="/account"');
    expect(html).not.toContain("OWNER PANEL");
    expect(html).not.toContain("site secret");
    expect(html).not.toContain("Spending");
    expect(html).not.toContain('href="/resources/manage"');
  });

  test("the account menu and Settings link leads a reviewer to the reviews", () => {
    auth.isChapterGuideReviewer = true;
    const html = renderToStaticMarkup(createElement(ChapterGuideReviewLink, { className: "item" }));
    expect(html).toContain(CONTROLS_LINK);
    expect(html).toContain("Chapter guide reviews");
  });

  test("anyone else doesn't get that link", () => {
    expect(renderToStaticMarkup(createElement(ChapterGuideReviewLink, { className: "item" }))).toBe("");
  });
});
