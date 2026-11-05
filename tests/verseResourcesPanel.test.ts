import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

// The real link rules, under the app's alias (this config resolves relative paths only).
vi.mock("@/features/comeFollowMe/passagePreview", () => import("../src/features/comeFollowMe/passagePreview"));

const { VerseResourcesResults } = await import("../src/components/VerseResourcesPanel");
import type { VerseLessonResource } from "../src/lib/cfm/verseResources";
import { chapterGuideHidesEmptyResources } from "../src/lib/chapterGuideView";

const scripture = "https://www.churchofjesuschrist.org/study/scriptures/ot/isa/61?lang=eng";
const manual = "https://www.churchofjesuschrist.org/study/manual/scripture-helps-old-testament/32-isaiah-40-49?lang=eng";
const resource: VerseLessonResource = {
  id: "2026-09-28:cfm-v-40-1-2",
  title: "Comfort Ye",
  reference: "Isaiah 40:1–2",
  lessonTitle: "Isaiah 40–49",
  dateLabel: "September 28–October 4",
  href: "/come-follow-me/2026-09-28#cfm-v-40-1-2",
  bodyHtml: `<p>See <a href="${scripture}" target="_blank" rel="noopener noreferrer">Isaiah 61:7</a>.</p>`,
  sources: [
    { title: "Isaiah 61:7", url: scripture },
    { title: "Scripture Helps", url: manual },
  ],
};

function render(onPreviewPassage?: () => void) {
  return renderToStaticMarkup(createElement(VerseResourcesResults, {
    reference: "Isaiah 40:1",
    lessonBook: { slug: "isaiah", volume: "oldtestament" },
    onPreviewPassage,
    resources: [resource],
    loading: false,
    error: null,
    onRetry: () => {},
  }));
}

const sourceLink = (html: string, url: string) => {
  const sources = html.slice(html.indexOf("Cited in this section"));
  return new RegExp(`<a href="${url.replace(/[.?]/g, "\\$&")}"[^>]*>[\\s\\S]*?</a>`).exec(sources)?.[0] ?? "";
};

describe("the empty-resources message beside a chapter guide", () => {
  const EMPTY_MESSAGE = "No resources for these verses";
  const generating = { stage: "write", startedAt: 0 };
  const renderResults = (overrides: Partial<Parameters<typeof VerseResourcesResults>[0]>) => renderToStaticMarkup(createElement(VerseResourcesResults, {
    reference: "Revelation 2:3",
    lessonBook: { slug: "revelation", volume: "newtestament" },
    resources: [],
    loading: false,
    error: null,
    onRetry: () => {},
    ...overrides,
  }));

  test("a guide being written takes the place of the message, and the web search stays", () => {
    const html = renderResults({ hideEmptyMessage: true });
    expect(html).not.toContain(EMPTY_MESSAGE);
    expect(html).toContain("Search Come, Follow Me on the web");
  });

  test("lesson resources and load errors still show while a guide is being written", () => {
    expect(renderResults({ hideEmptyMessage: true, resources: [resource] })).toContain("Comfort Ye");
    const failed = renderResults({ hideEmptyMessage: true, error: "Unable to load lesson resources" });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Try again");
    expect(renderResults({ hideEmptyMessage: true, loading: true })).toContain("Looking for resources");
  });

  test("with nothing else to say, the message stays", () => {
    expect(renderResults({})).toContain(EMPTY_MESSAGE);
  });

  test("only a known pending guide, generated resources, or an unfinished check hide it", () => {
    const state = { hasGuide: false, resources: [], generating: null };
    expect(chapterGuideHidesEmptyResources({ ...state, generating }, false)).toBe(true);
    expect(chapterGuideHidesEmptyResources({ ...state, generating }, true)).toBe(true);
    expect(chapterGuideHidesEmptyResources(null, false)).toBe(true);
    expect(chapterGuideHidesEmptyResources(null, true)).toBe(false);
    expect(chapterGuideHidesEmptyResources(state, false)).toBe(false);
    expect(chapterGuideHidesEmptyResources({ ...state, hasGuide: true, generating }, false)).toBe(false);
    expect(chapterGuideHidesEmptyResources({ ...state, hasGuide: true, resources: [{ id: "a" } as never] }, false)).toBe(true);
  });
});

describe("the lesson line on a resource card", () => {
  test("a Come, Follow Me resource shows its lesson and dates", () => {
    expect(render()).toContain(">Isaiah 40–49 · September 28–October 4</p>");
  });
});

describe("cited sources in the reader's Resources", () => {
  test("a cited scripture opens in the scripture preview, not a new Gospel Library tab", () => {
    const link = sourceLink(render(() => {}), scripture);
    expect(link).toMatch(new RegExp(`^<a href="${scripture.replace(/[.?]/g, "\\$&")}" class="[^"]*">Isaiah 61:7</a>$`));
    expect(link).not.toContain("target=");
  });

  test("citations that are not scripture still open on their own site in a new tab", () => {
    const link = sourceLink(render(() => {}), manual);
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(link).toContain("opens in a new tab");
  });

  test("without a preview to open, every citation stays an external link", () => {
    const html = render();
    expect(sourceLink(html, scripture)).toContain('target="_blank"');
    expect(sourceLink(html, manual)).toContain('target="_blank"');
  });
});
