import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import DictionaryEntryBody from "../src/components/DictionaryEntryBody";
import { decodeBibleTargetToHref, formatDictionaryMarkup } from "../src/lib/dictionaryFormatting";

describe("shared dictionary formatting", () => {
  test("preserves web link accessibility and native link markup", () => {
    const source = '<a href="https://example.com">Source</a>';
    expect(formatDictionaryMarkup(source)).toBe('<p><a href="https://example.com" class="dict-link-chip" target="_blank" rel="noopener noreferrer">Source<span class="dict-link-icon" aria-hidden="true">↗</span></a></p>');
    expect(formatDictionaryMarkup(source, "native")).toBe('<p><a href="https://example.com" class="dict-link-chip">Source<span class="dict-link-icon">↗</span></a></p>');
  });

  test("keeps web blockquote styling out of native markup", () => {
    const source = "<blockquote>Faith is the substance.</blockquote>";
    expect(formatDictionaryMarkup(source)).toContain('<blockquote class="border-l-2 border-foreground/20 pl-3 italic">');
    expect(formatDictionaryMarkup(source, "native")).toMatch(/^<blockquote>.*<\/blockquote>$/);
    expect(renderToStaticMarkup(createElement(DictionaryEntryBody, { entryText: source }))).toContain(formatDictionaryMarkup(source));
  });

  test("resolves Bible targets while preserving dictionary lookups", () => {
    expect(decodeBibleTargetToHref("58011001")).toBe("/browse/newtestament/hebrews/11#v-1");
    expect(decodeBibleTargetToHref("01001001")).toBe("/browse/oldtestament/genesis/1#v-1");
    for (const target of ["", "invalid", "00001001", "67001001", "40000001", "40001000"]) {
      expect(decodeBibleTargetToHref(target)).toBeNull();
    }
    for (const presentation of ["web", "native"] as const) {
      const html = formatDictionaryMarkup('See <u>Trust</u>. <a class="bible" target="58011001">Hebrews</a>', presentation);
      expect(html).toContain('href="#" class="dict-see-ref" data-dict-term="Trust"');
      expect(html).toContain('href="/browse/newtestament/hebrews/11#v-1" class="dict-link-chip dict-bible-link"');
    }
  });

  test("escapes unrecognized markup and refuses executable link schemes", () => {
    for (const presentation of ["web", "native"] as const) {
      const html = formatDictionaryMarkup('<script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="data:text/html,test">bad</a>', presentation);
      expect(html).not.toContain("<script>");
      expect(html).not.toContain('<a href="javascript:');
      expect(html).not.toContain('<a href="data:');
      expect(html).toContain("&amp;lt;script&amp;gt;");
    }
  });

  test("preserves source structure and citation styling", () => {
    for (const presentation of ["web", "native"] as const) {
      const html = formatDictionaryMarkup('<pos>noun</pos>\n\n<ol class="numbers"><li>Trust</li><li>Hope</li></ol>\n\n— Shakespeare.', presentation);
      expect(html).toContain("<span>noun</span>");
      expect(html).toContain('<ol class="dict-ol"><li>Trust</li><li>Hope</li></ol>');
      expect(html).toContain('<span class="dict-cite">— Shakespeare.</span>');
    }
  });
});
