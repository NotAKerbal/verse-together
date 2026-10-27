import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/DictionaryEntryCard", () => ({
  default: ({ entry }: { entry: { word: string } }) => createElement("article", null, `definition:${entry.word}`),
}));
vi.mock("@/components/EtymologyEntryCard", () => ({
  default: ({ item }: { item: { text: string } }) => createElement("article", null, `history:${item.text}`),
}));

const { default: WordStudyPanel, EnglishMeaningsSection } = await import("../src/components/WordStudyPanel");
const { loadStudyHelpsIndex, studyHelpEntries, lexiconLookups } = await import("../src/components/WordStudySources");
const { StudyHelpArticle } = await import("../src/components/StudyHelpArticle");
const { parseStudyHelpPage } = await import("../src/lib/studyHelpContent.server");
const { lookupStrongs } = await import("../src/lib/strongsLexicon.server");
const { bdFaithPage, gsFaithPage, tgFaithPage } = await import("./fixtures/studyHelpPages");

const genesis = { volume: "oldtestament", book: "genesis", chapter: 1 };
const firstNephi = { volume: "bookofmormon", book: "1nephi", chapter: 3 };

function countOf(html: string, text: string) {
  return html.split(text).length - 1;
}

// These run before the topic list loads; the last block loads it.
describe("Explore word study before the lookup completes", () => {
  test("shows a loading message instead of announcing an empty result", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: " Faith " }));
    expect(html).toContain("Looking up faith…");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("No dictionary entry");
    expect(html).not.toContain("word history for this word");
    expect(html).toContain('aria-label="Sources for faith"');
  });

  test("names the selected word in the panel heading", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "Faith", title: "Explore Word" }));
    expect(html).toContain('aria-label="Explore Word: faith"');
    expect(html).toMatch(/<h3[^>]*>faith<\/h3>/);
  });

  test("shows each study helps guide and the Hebrew lexicon loading while definitions load", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "faith", context: firstNephi }));
    for (const guide of ["bd", "gs", "tg"]) {
      expect(html).toContain(`href="https://www.churchofjesuschrist.org/study/scriptures/${guide}?lang=eng"`);
    }
    for (const label of ["Bible Dictionary", "Guide to the Scriptures", "Topical Guide"]) {
      expect(html).toMatch(new RegExp(`<h5[^>]*><button type="button" aria-expanded="true"[^>]*>${label}<svg`));
    }
    expect(countOf(html, "Finding topics for “faith”…")).toBe(3);
    expect(html).toContain("Looking up “faith” in Strong’s Hebrew dictionary…");
    expect(html).not.toContain("Greek dictionary…");
    // Sources come before the English definitions.
    expect(html.indexOf("Scripture study helps")).toBeLessThan(html.indexOf("Looking up faith…"));
    expect(html.indexOf("Biblical languages")).toBeLessThan(html.indexOf("English meanings"));
  });

  test("opens every external source in a new tab without sharing the page", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "faith", context: genesis }));
    const links = html.match(/<a [^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const link of links) {
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
    }
    expect(countOf(html, "(opens in a new tab)")).toBe(links.length);
  });

  test("leads with the language of the testament being read and keeps the chapter interlinear", () => {
    const inGenesis = renderToStaticMarkup(createElement(WordStudyPanel, { word: "light", context: genesis }));
    expect(inGenesis).toContain('href="https://biblehub.com/interlinear/genesis/1.htm"');
    expect(inGenesis).toContain("Genesis 1 interlinear");
    expect(inGenesis).toMatch(/aria-pressed="true"[^>]*>Hebrew<\/button>/);
    expect(inGenesis.indexOf(">Hebrew</button>")).toBeLessThan(inGenesis.indexOf(">Greek</button>"));

    const inMatthew = renderToStaticMarkup(createElement(WordStudyPanel, { word: "light", context: { volume: "newtestament", book: "matthew", chapter: 5 } }));
    expect(inMatthew).toContain('href="https://biblehub.com/interlinear/matthew/5.htm"');
    expect(inMatthew).toMatch(/aria-pressed="true"[^>]*>Greek<\/button>/);
    expect(inMatthew.indexOf(">Greek</button>")).toBeLessThan(inMatthew.indexOf(">Hebrew</button>"));
    expect(inMatthew).toContain("Strong’s Greek dictionary…");

    for (const context of [firstNephi, undefined, { volume: "oldtestament", book: "genesis", chapter: 99 }]) {
      const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "light", context }));
      expect(html).not.toContain("biblehub.com/interlinear");
      expect(html).toMatch(/aria-pressed="true"[^>]*>Hebrew<\/button>/);
    }
  });

  test("looks up the plain word", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "Lord's" }));
    expect(html).toContain("Looking up “lord” in Strong’s Hebrew dictionary…");
  });

  test("provides a named dismiss control when the reader supplies one", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "faith", onClose: () => {} }));
    expect(html).toContain('aria-label="Close word study"');
    expect(renderToStaticMarkup(createElement(WordStudyPanel, { word: "faith" }))).not.toContain("Close word study");
  });

  test("does not show a lookup panel for a blank selection", () => {
    expect(renderToStaticMarkup(createElement(WordStudyPanel, { word: "  " }))).toBe("");
  });
});

describe("English meanings after the lookup", () => {
  const render = (lookup: Parameters<typeof EnglishMeaningsSection>[0]["lookup"]) =>
    renderToStaticMarkup(createElement(EnglishMeaningsSection, { word: "faith", lookup, onRetry: () => {} }));

  test("offers a retry when the lookup fails", () => {
    const html = render({ status: "error" });
    expect(html).toContain("We couldn’t load dictionary entries for this word.");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
  });

  test("explains when no dictionary has the word", () => {
    const html = render({ status: "ready", payload: { ok: true, enabled: true, byEdition: {}, etymology: { items: [] } } });
    expect(html).toContain("No dictionary entry for this word.");
    expect(html).not.toContain("Try again");
  });

  test("lists definitions and word history", () => {
    const html = render({
      status: "ready",
      payload: {
        ok: true,
        enabled: true,
        byEdition: { "1828": { entries: [{ id: "1", edition: "1828", word: "FAITH", heading: null, entryText: "Belief", pronounce: null }] } },
        etymology: { items: [{ id: "e1", source: "etymonline", word: "faith", text: "from Latin fides" }] },
      },
    });
    expect(html).toContain("definition:FAITH");
    expect(html).toContain("history:from Latin fides");
    expect(html).not.toContain("Our sources don’t have");
  });
});

describe("Explore word study once the topic list is loaded", () => {
  test("selects the matching entry in each guide and offers the other topics in place", async () => {
    await loadStudyHelpsIndex();
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "born", context: genesis }));
    expect(html).not.toContain("Finding topics");
    // The Topical Guide's "Born" entry loads first; its other topics are buttons that load in the same card.
    expect(html).toContain("Loading Born…");
    expect(html).toMatch(/<button type="button" aria-pressed="true"[^>]*><span[^>]*>Born<\/span><\/button>/);
    for (const title of ["Bear, Bare, Born, Borne [verb]", "Born Again", "Born of God"]) {
      expect(html).toMatch(new RegExp(`<button type="button" aria-pressed="false"[^>]*><span[^>]*>${title.replace(/[[\]]/g, "\\$&")}</span></button>`));
    }
    expect(html).not.toContain("study/scriptures/tg/born?lang=eng");
    // The Bible Dictionary has no "born" topic.
    expect(html).toContain("No “born” topic. Browse the Bible Dictionary for a related word.");
  });

  test("falls back to browsing when no guide has the word", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "xyzzy" }));
    expect(countOf(html, "No “xyzzy” topic.")).toBe(3);
    expect(html).not.toContain("aria-pressed=\"true\"><span");
    expect(html).toContain('href="https://www.churchofjesuschrist.org/study/scriptures/gs?lang=eng"');
  });
});

describe("Explore word study with entries and lexicon results loaded", () => {
  const entries = {
    "bd/faith": parseStudyHelpPage(bdFaithPage, "bd", "faith"),
    "gs/faith": parseStudyHelpPage(gsFaithPage, "gs", "faith"),
    "tg/faith": parseStudyHelpPage(tgFaithPage, "tg", "faith"),
  };

  test("loads each entry and the Hebrew results through the app's own API", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", async (input: string) => {
      requested.push(input);
      const url = new URL(input, "http://localhost");
      if (url.pathname === "/api/tools/study-helps") {
        const entry = entries[`${url.searchParams.get("guide")}/${url.searchParams.get("slug")}` as keyof typeof entries];
        return Response.json({ ok: true, entry });
      }
      const lookup = await lookupStrongs(url.searchParams.get("language") as "hebrew", url.searchParams.get("term") ?? "");
      return Response.json({ ok: true, lookup });
    });
    try {
      await loadStudyHelpsIndex();
      await Promise.all([
        ...Object.keys(entries).map((key) => studyHelpEntries.request(key).promise),
        lexiconLookups.request("hebrew:faith").promise,
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(requested).toEqual([
      "/api/tools/study-helps?guide=bd&slug=faith",
      "/api/tools/study-helps?guide=gs&slug=faith",
      "/api/tools/study-helps?guide=tg&slug=faith",
      "/api/tools/lexicon?language=hebrew&term=faith",
    ]);

    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "faith", context: genesis }));
    expect(html).not.toContain("Loading Faith…");
    // Each guide's entry, previewed.
    expect(html).toContain("Faith is to hope for things which are not seen");
    expect(html).toContain("Confidence in something or someone.");
    expect(html).toContain("children in whom is no <b class=\"font-semibold\">faith</b>");
    expect(countOf(html, ">Read more<")).toBe(3);
    expect(countOf(html, 'aria-expanded="false"')).toBe(3);
    expect(countOf(html, ">Read at source<")).toBe(3);
    // Scripture references open in the reader; topics of the same guide open in place.
    expect(html).toContain('<a class="rounded text-[color:var(--accent-rubric)]');
    expect(html).toMatch(/<a [^>]*href="\/browse\/newtestament\/hebrews\/11#v-1"[^>]*>Heb\. 11:1<\/a>/);
    expect(html).not.toMatch(/href="\/browse[^"]*"[^>]*target=/);
    expect(html).toMatch(/<button type="button" class="[^"]*">Hope<\/button>/);

    // Strong's Hebrew results, with the lemma isolated right to left; Greek waits until chosen.
    expect(html).toMatch(/<bdi lang="he" dir="rtl"[^>]*>אֱמוּנָה<\/bdi>/);
    expect(html).toContain("H530");
    expect(html).toContain("not the word in this verse");
    expect(html).toContain("Strong’s Hebrew Dictionary, from");
    expect(html).not.toContain("πίστις");
    expect(html).toContain("Looking up faith…");
  });

  test("keeps same-guide topics inline, other guides' topics as source links, and long text expandable", () => {
    const render = (entry: (typeof entries)[keyof typeof entries]) =>
      renderToStaticMarkup(createElement(StudyHelpArticle, { entry, guideLabel: "Topical Guide", onSelectTopic: () => {} }));
    const tg = render(entries["tg/faith"]);
    expect(tg).toContain(">Assurance</button>");
    // Isolate this link's rendering from how much of the long See also list fits in the preview.
    const seeAlso = entries["tg/faith"].blocks[0];
    if (seeAlso.type !== "paragraph") throw new Error("Expected the See also paragraph");
    const crossGuide = seeAlso.content.find((node) => typeof node !== "string" && "href" in node && node.topic?.guide === "bd");
    if (!crossGuide) throw new Error("Expected a Bible Dictionary reference");
    const crossGuideHtml = render({ ...entries["tg/faith"], blocks: [{ type: "paragraph", content: [crossGuide] }] });
    expect(crossGuideHtml).toMatch(/<a href="https:\/\/www\.churchofjesuschrist\.org\/study\/scriptures\/bd\/faith\?lang=eng" target="_blank" rel="noopener noreferrer"[^>]*><small[^>]*>BD<\/small> Faith/);
    const bd = render(entries["bd/faith"]);
    expect(bd).not.toContain("Other references to faith include");
    expect(bd).toContain(">Read more<");
  });
});
