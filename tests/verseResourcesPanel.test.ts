import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

// The real link rules, under the app's alias (this config resolves relative paths only).
vi.mock("@/features/comeFollowMe/passagePreview", () => import("../src/features/comeFollowMe/passagePreview"));

const { VerseResourcesResults } = await import("../src/components/VerseResourcesPanel");
import type { VerseLessonResource } from "../src/lib/cfm/verseResources";

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
