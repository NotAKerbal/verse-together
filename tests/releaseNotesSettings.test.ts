import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { unreleasedItems } from "../scripts/unreleased-notes.mjs";
import ReleaseNotes from "../src/features/settings/ReleaseNotes";
import { UNRELEASED } from "../src/lib/unreleasedNotes";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("Settings → Release notes upcoming changes", () => {
  test("serve every entry in release-notes/unreleased", () => {
    expect(UNRELEASED.items).toEqual(unreleasedItems());
  });

  test("show each unreleased entry under Upcoming changes, and nothing when there are none", () => {
    const html = renderToStaticMarkup(createElement(ReleaseNotes));
    if (UNRELEASED.items.length === 0) {
      expect(html).not.toContain("Upcoming changes");
      return;
    }
    const upcoming = html.slice(html.indexOf("Upcoming changes"), html.indexOf("</section>"));
    for (const item of UNRELEASED.items) expect(upcoming).toContain(escapeHtml(item.text));
  });
});
