import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/browse/bookofmormon/alma/32" }));
vi.mock("@/lib/useFaithTradition", () => ({ useFaithTradition: () => ({ showLdsContent: true }) }));
vi.mock("@/lib/browseNavigation", () => ({ useBrowseNavHref: () => "/browse" }));
vi.mock("@/components/AccountControl", () => ({ default: () => null }));
vi.mock("@/components/LibrarySearch", () => ({ default: () => null }));

import Navbar from "../src/components/Navbar";

type CssRule = { media: string | null; selector: string; body: string };

function cssRules(source: string): CssRule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: CssRule[] = [];
  const walk = (text: string, media: string | null) => {
    let index = 0;
    while (index < text.length) {
      const open = text.indexOf("{", index);
      if (open === -1) return;
      const prelude = text.slice(index, open).trim();
      let depth = 1;
      let close = open + 1;
      while (depth > 0 && close < text.length) {
        if (text[close] === "{") depth += 1;
        if (text[close] === "}") depth -= 1;
        close += 1;
      }
      const body = text.slice(open + 1, close - 1);
      if (prelude.startsWith("@media")) walk(body, prelude);
      else if (!prelude.startsWith("@")) rules.push({ media, selector: prelude, body });
      index = close;
    }
  };
  walk(css, null);
  return rules;
}

const rules = cssRules(readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8"));
const simpleRules = rules.filter((rule) => rule.selector.includes('[data-simple="true"]'));
const PHONE_MEDIA = "@media (max-width: 639.98px)";

describe("simple mode keeps the reader in place", () => {
  test("no simple-mode rule resizes or restyles the reader's text column", () => {
    for (const rule of simpleRules) {
      expect(rule.selector).not.toMatch(/\.reader-(layout|column)\b|\.verse-badge\b/);
    }
  });

  test("the reader's notes panel keeps its geometry in simple mode", () => {
    const notesRules = rules.filter((rule) => rule.selector.includes('[data-notes-panel="reader"]'));
    expect(notesRules.length).toBeGreaterThan(0);
    for (const rule of notesRules) expect(rule.selector).not.toContain("data-simple");
    for (const rule of simpleRules) expect(rule.body).not.toMatch(/padding-right/);
  });

  test("the header and page spacing only change in simple mode on phones", () => {
    const moved = simpleRules.filter((rule) =>
      /\.app-header\b|\.app-main\b|\.reader-chapter-title\b|\.verse-columns-header\b/.test(rule.selector) &&
      /\b(position|margin|padding|padding-top|top|display)\s*:/.test(rule.body) &&
      !rule.selector.includes(".desktop-nav-content") &&
      !rule.selector.includes(".desktop-nav-toggle-icon")
    );
    expect(moved.length).toBeGreaterThan(0);
    for (const rule of moved) expect(rule.media).toBe(PHONE_MEDIA);
  });

  test("the chapter's header steps aside without giving up its space", () => {
    const conceal = simpleRules.find((rule) => rule.selector.includes(".simple-conceal"));
    expect(conceal?.body).toMatch(/visibility:\s*hidden/);
    expect(conceal?.body).not.toMatch(/display:/);
  });
});

describe("the header's arrow turns simple mode on and off", () => {
  test("it is a simple mode toggle that simple mode itself never hides", () => {
    const html = renderToStaticMarkup(createElement(Navbar));
    const toggle = html.match(/<button[^>]*class="desktop-nav-toggle"[^>]*>/)?.[0] ?? "";
    expect(toggle).toContain('aria-label="Turn simple mode on"');
    expect(toggle).toContain('aria-pressed="false"');
    expect(html).not.toContain("simple-hide desktop-nav");
  });

  test("simple mode collapses the navigation beside it, and phones keep the exit pill instead", () => {
    const collapse = simpleRules.find((rule) => rule.selector === ':root[data-simple="true"] .desktop-nav-content');
    expect(collapse?.media).toBeNull();
    expect(collapse?.body).toMatch(/grid-template-columns:\s*0fr/);
    const pillHidden = rules.find((rule) => rule.selector === ".simple-exit-pill" && rule.media === "@media (min-width: 640px)");
    expect(pillHidden?.body).toMatch(/display:\s*none/);
    const eyeHidden = rules.find((rule) => rule.selector === ".reader-toolbar-simple-toggle");
    expect(eyeHidden?.media).toBe("@media (min-width: 640px)");
  });
});
