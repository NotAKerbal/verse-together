// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const viewer = vi.hoisted(() => ({ getServerViewer: vi.fn() }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/lib/auth-server", () => ({ getServerViewer: viewer.getServerViewer }));
vi.mock("@/lib/ldsLocalData.server", () => ({ getLocalLdsVolumes: async () => [], getLocalLdsBooks: async () => [] }));
vi.mock("@/features/chapterGuides/ChapterGuideOwnerPanel", () => ({ default: () => null }));

const { default: ResourceManagerPage } = await import("../src/app/resources/manage/page");
const { default: ChapterGuideOwnerPage } = await import("../src/app/resources/manage/chapter-guides/page");

const CONTROLS_LINK = 'href="/resources/manage/chapter-guides"';

beforeEach(() => {
  viewer.getServerViewer.mockReset();
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
    ["a signed-out visitor", { viewer: null }],
  ])("%s doesn't get the link", async (_name, response) => {
    viewer.getServerViewer.mockResolvedValue(response);
    expect(renderToStaticMarkup(await ResourceManagerPage())).not.toContain(CONTROLS_LINK);
  });

  test("the controls page leads an admin back to the resource manager", async () => {
    viewer.getServerViewer.mockResolvedValue({ viewer: { isAdmin: true } });
    expect(renderToStaticMarkup(await ChapterGuideOwnerPage())).toContain('href="/resources/manage"');
  });

  test("the controls page shows others only a refusal and a way out", async () => {
    viewer.getServerViewer.mockResolvedValue({ viewer: { isAdmin: false } });
    const html = renderToStaticMarkup(await ChapterGuideOwnerPage());
    expect(html).toContain("only available to admins");
    expect(html).toContain('href="/browse"');
    expect(html).not.toContain("AI chapter guides");
  });
});
