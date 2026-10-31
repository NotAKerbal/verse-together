import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { ExploreDisclosure } from "../src/components/ExploreSection";
import type { WordStudyContext } from "../src/lib/wordStudySources";

// These fixtures exercise Latter-day Saint study helps. The server snapshot now hides those
// until the device preference is known, so select the tradition this suite is testing explicitly.
vi.mock("@/lib/useFaithTradition", () => ({
  useFaithTradition: () => ({ tradition: "latter-day-saint", showLdsContent: true, setTradition: () => true }),
}));

vi.mock("@/components/DictionaryEntryCard", () => ({
  default: ({ entry }: { entry: { word: string } }) => createElement("article", null, `definition:${entry.word}`),
}));
vi.mock("@/components/EtymologyEntryCard", () => ({
  default: ({ item }: { item: { text: string } }) => createElement("article", null, `history:${item.text}`),
}));

const { default: WordStudyPanel, EnglishMeaningsSection, englishResults } = await import("../src/components/WordStudyPanel");
const {
  BiblicalLanguagesSection,
  ScriptureHelpsSection,
  loadStudyHelpsIndex,
  studyHelpEntries,
  lexiconLookups,
  useBiblicalLanguages,
  useScriptureHelps,
} = await import("../src/components/WordStudySources");
const { StudyHelpArticle } = await import("../src/components/StudyHelpArticle");
const { parseStudyHelpPage } = await import("../src/lib/studyHelpContent.server");
const { lookupStrongs } = await import("../src/lib/strongsLexicon.server");
const { bdFaithPage, gsFaithPage, tgFaithPage } = await import("./fixtures/studyHelpPages");

const genesis = { volume: "oldtestament", book: "genesis", chapter: 1 };
const firstNephi = { volume: "bookofmormon", book: "1nephi", chapter: 3 };

function countOf(html: string, text: string) {
  return html.split(text).length - 1;
}

/** The markup of the section header button that names the section. */
function headerOf(html: string, title: string) {
  const at = html.indexOf(`>${title}<`);
  if (at < 0) return "";
  return html.slice(html.lastIndexOf("<button", at), html.indexOf("</button>", at));
}

// Each section opened directly, as the panel does when its header is chosen, with one result open or none.
const opened = (openRow: string | null = null): ExploreDisclosure => ({ open: true, openRow, onToggle: () => {}, onToggleRow: () => {} });
const closed: ExploreDisclosure = { open: false, openRow: null, onToggle: () => {}, onToggleRow: () => {} };

function OpenHelps({ word, row = null }: { word: string; row?: string | null }) {
  return createElement("ul", null, createElement(ScriptureHelpsSection, { word, helps: useScriptureHelps(word), disclosure: opened(row) }));
}
function OpenLanguages({ word, context, row = null }: { word: string; context?: WordStudyContext; row?: string | null }) {
  return createElement("ul", null, createElement(BiblicalLanguagesSection, { lexicons: useBiblicalLanguages(word, context), disclosure: opened(row) }));
}
const helpsOpen = (word: string, row?: string) => renderToStaticMarkup(createElement(OpenHelps, { word, row }));
const languagesOpen = (word: string, context?: WordStudyContext, row?: string) => renderToStaticMarkup(createElement(OpenLanguages, { word, context, row }));

// These run before the topic list loads; the last block loads it.
describe("Explore word study before the lookup completes", () => {
  test("starts with every section collapsed, its content not yet rendered", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: " Faith ", context: firstNephi }));
    expect(html).toContain('aria-label="Sources for faith"');
    expect(countOf(html, 'aria-expanded="false"')).toBe(3);
    expect(html).not.toContain('aria-expanded="true"');
    // Each header controls a region that is hidden and empty until it opens.
    for (const [, id] of html.matchAll(/aria-controls="([^"]+)"/g)) {
      expect(html).toMatch(new RegExp(`<div id="${id}" role="region" aria-labelledby="[^"]+" hidden=""[^>]*></div>`));
    }
    expect(html).not.toContain("Looking up faith…");
    expect(html).not.toContain("Strong’s Hebrew dictionary…");
    expect(html).not.toContain("Finding study-help topics");
  });

  test("names the selected word in the panel heading", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "Faith", title: "Explore Word" }));
    expect(html).toContain('aria-label="Explore Word: faith"');
    expect(html).toMatch(/<h3[^>]*>faith<\/h3>/);
  });

  test("shows every source loading in its collapsed header, without claiming anything is missing", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "faith", context: firstNephi }));
    const titles = ["Study helps", "Biblical languages", "English meanings"];
    for (const title of titles) {
      expect(headerOf(html, title)).toContain("Loading");
    }
    // Sources come before the English definitions, each in its own tone.
    expect(html.indexOf(">Study helps<")).toBeLessThan(html.indexOf(">Biblical languages<"));
    expect(html.indexOf(">Biblical languages<")).toBeLessThan(html.indexOf(">English meanings<"));
    expect(html.match(/data-tone="(\w+)"/g)).toEqual(['data-tone="sage"', 'data-tone="blue"', 'data-tone="clay"']);
    expect(headerOf(html, "Study helps")).toContain("Bible Dictionary · Guide to the Scriptures · Topical Guide");
    // Both languages are offered until one comes back empty.
    expect(headerOf(html, "Biblical languages")).toContain(">Hebrew · Greek<");
    expect(headerOf(html, "English meanings")).toContain(">Definitions · Word history<");
    expect(html).not.toContain("No matches for");
    expect(html).not.toContain("Nothing found");
  });

  test("an opened section shows its loading states", () => {
    expect(helpsOpen("faith")).toContain("Finding study-help topics for “faith”…");
    const languages = languagesOpen("faith", firstNephi);
    expect(languages).toMatch(/<h4><button[^>]*aria-expanded="true"/);
    expect(languages.indexOf("Strong’s Hebrew dictionary…")).toBeGreaterThan(-1);
    expect(languages.indexOf("Strong’s Hebrew dictionary…")).toBeLessThan(languages.indexOf("Strong’s Greek dictionary…"));
    expect(countOf(languages, 'role="status"')).toBe(2);
  });

  test("opens every external source in a new tab without sharing the page", () => {
    const html = [
      renderToStaticMarkup(createElement(WordStudyPanel, { word: "faith", context: genesis })),
      languagesOpen("faith", genesis),
    ].join("");
    const links = html.match(/<a [^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const link of links) {
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
    }
    expect(countOf(html, "(opens in a new tab)")).toBe(links.length);
  });

  test("leads with the language of the testament being read and keeps the chapter interlinear", () => {
    const inGenesis = languagesOpen("light", genesis);
    expect(inGenesis).toContain('href="https://biblehub.com/interlinear/genesis/1.htm"');
    expect(inGenesis).toContain(">Genesis 1 interlinear<");
    expect(inGenesis.indexOf("Strong’s Hebrew dictionary…")).toBeLessThan(inGenesis.indexOf("Strong’s Greek dictionary…"));
    expect(headerOf(renderToStaticMarkup(createElement(WordStudyPanel, { word: "light", context: genesis })), "Biblical languages"))
      .toContain(">Hebrew · Greek · Genesis 1 interlinear<");

    const matthew = { volume: "newtestament", book: "matthew", chapter: 5 };
    const inMatthew = languagesOpen("light", matthew);
    expect(inMatthew).toContain('href="https://biblehub.com/interlinear/matthew/5.htm"');
    expect(inMatthew.indexOf("Strong’s Greek dictionary…")).toBeLessThan(inMatthew.indexOf("Strong’s Hebrew dictionary…"));
    expect(headerOf(renderToStaticMarkup(createElement(WordStudyPanel, { word: "light", context: matthew })), "Biblical languages"))
      .toContain(">Greek · Hebrew · Matthew 5 interlinear<");

    for (const context of [firstNephi, undefined, { volume: "oldtestament", book: "genesis", chapter: 99 }]) {
      const html = languagesOpen("light", context);
      expect(html).not.toContain("biblehub.com/interlinear");
      expect(html.indexOf("Strong’s Hebrew dictionary…")).toBeLessThan(html.indexOf("Strong’s Greek dictionary…"));
    }
  });

  test("looks up the plain word", () => {
    expect(languagesOpen("lord's")).toContain("Looking up “lord” in Strong’s Hebrew dictionary…");
  });

  test("provides a named, full-size dismiss control when the reader supplies one", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "faith", onClose: () => {} }));
    expect(html).toMatch(/<button type="button" aria-label="Close word study" class="[^"]*\bsize-10\b/);
    expect(renderToStaticMarkup(createElement(WordStudyPanel, { word: "faith" }))).not.toContain("Close word study");
  });

  test("does not show a lookup panel for a blank selection", () => {
    expect(renderToStaticMarkup(createElement(WordStudyPanel, { word: "  " }))).toBe("");
  });
});

describe("English meanings after the lookup", () => {
  type Lookup = Parameters<typeof englishResults>[0];
  const render = (lookup: Lookup, disclosure: ExploreDisclosure = opened()) =>
    renderToStaticMarkup(createElement("ul", null, createElement(EnglishMeaningsSection, { word: "faith", english: englishResults(lookup), onRetry: () => {}, disclosure })));
  const history = { id: "e1", source: "etymonline", word: "faith", text: "from Latin fides" };
  const found: Lookup = {
    status: "ready",
    payload: {
      ok: true,
      enabled: true,
      byEdition: { "1828": { entries: [{ id: "1", edition: "1828", word: "FAITH", heading: null, entryText: "Belief", pronounce: null }] } },
      providerLabels: { "1828": "Merriam-Webster" },
      etymology: { items: [history] },
    },
  };

  test("says the lookup failed even while collapsed, and offers a retry once open", () => {
    expect(headerOf(render({ status: "error" }, closed), "English meanings")).toContain("Didn’t load");
    const html = render({ status: "error" });
    expect(html).toContain("We couldn’t load dictionary entries for this word.");
    expect(html).toMatch(/<button type="button" class="[^"]*">Try again<\/button>/);
  });

  test("shows the lookup loading once open", () => {
    const html = render({ status: "loading" });
    expect(html).toContain("Looking up faith…");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("No dictionary entry");
  });

  test("hides the section when no dictionary has the word", () => {
    const lookup: Lookup = { status: "ready", payload: { ok: true, enabled: true, byEdition: {}, etymology: { items: [] } } };
    expect(englishResults(lookup).status).toBe("empty");
    expect(render(lookup)).toBe("<ul></ul>");
  });

  test("leaves out an empty part instead of describing it", () => {
    const lookup: Lookup = { status: "ready", payload: { ok: true, enabled: true, byEdition: {}, etymology: { items: [history] } } };
    const header = headerOf(render(lookup, closed), "English meanings");
    expect(header).toContain(">Word history<");
    expect(header).not.toContain("Definitions");
    expect(header).toMatch(/>1<span class="[^"]*"> entry<\/span>/);
    const html = render(lookup, opened("etymology:e1"));
    expect(html).toContain("history:from Latin fides");
    expect(html).not.toContain("definition:");
    expect(html).not.toContain("Our sources don’t have");
  });

  test("lists each definition and word history as a title row, opening one at a time", () => {
    expect(headerOf(render(found, closed), "English meanings")).toMatch(/>Definitions · Word history<[\s\S]*>2<span class="[^"]*"> entries<\/span>/);

    const rows = render(found);
    expect(rows).toMatch(/<span[^>]*>Merriam-Webster<\/span><span[^>]*>FAITH<\/span>/);
    expect(rows).toMatch(/<span[^>]*>Word history · etymonline<\/span><span[^>]*>faith<\/span>/);
    expect(countOf(rows, "data-explore-row")).toBe(2);
    expect(rows).not.toContain('data-explore-row="" aria-expanded="true"');
    expect(rows).not.toContain("definition:");
    expect(rows).not.toContain("history:");

    const definition = render(found, opened("dictionary:1"));
    expect(countOf(definition, 'data-explore-row="" aria-expanded="true"')).toBe(1);
    expect(definition).toContain("definition:FAITH");
    expect(definition).not.toContain("history:");
  });
});

describe("Explore word study once the topic list is loaded", () => {
  test("lists each guide with a match as a title row, and opens one guide's topics in place", async () => {
    await loadStudyHelpsIndex();
    const panel = renderToStaticMarkup(createElement(WordStudyPanel, { word: "born", context: genesis }));
    const header = headerOf(panel, "Study helps");
    expect(header).toContain(">Guide to the Scriptures · Topical Guide<");
    expect(header).toMatch(/>2<span class="[^"]*"> sources<\/span>/);
    // The Bible Dictionary has no "born" topic: no row, but it is listed as searched, with a link to browse it.
    expect(panel).toContain("No matches for “born” in");
    expect(panel).toMatch(/<span>Bible Dictionary<\/span><a href="https:\/\/www\.churchofjesuschrist\.org\/study\/scriptures\/bd\?lang=eng"/);
    expect(panel).not.toMatch(/<li[^>]*><span>(Topical Guide|Guide to the Scriptures)<\/span>/);

    // Open, the section shows one row per guide, each titled with its best topic; no entry loads until one opens.
    const rows = helpsOpen("born");
    expect(rows).not.toContain("Finding study-help topics");
    expect(countOf(rows, 'data-explore-row="" aria-expanded="false"')).toBe(2);
    expect(rows).toMatch(/<span[^>]*>Topical Guide<\/span><span[^>]*>Born<\/span>/);
    expect(rows).not.toContain(">Bible Dictionary<");
    expect(rows).not.toContain("Loading Born…");
    expect(rows).not.toContain("aria-pressed");

    // The Topical Guide's "Born" entry loads first; its other topics are buttons that load in the same row.
    const topical = helpsOpen("born", "tg");
    expect(countOf(topical, 'data-explore-row="" aria-expanded="true"')).toBe(1);
    expect(topical).toContain("Loading Born…");
    expect(topical).toMatch(/<button type="button" aria-pressed="true"[^>]*><span[^>]*>Born<\/span><\/button>/);
    for (const title of ["Bear, Bare, Born, Borne [verb]", "Born Again", "Born of God"]) {
      expect(topical).toMatch(new RegExp(`<button type="button" aria-pressed="false" class="[^"]*\\bmin-h-10\\b[^"]*"><span[^>]*>${title.replace(/[[\]]/g, "\\$&")}</span></button>`));
    }
    expect(topical).toContain('href="https://www.churchofjesuschrist.org/study/scriptures/tg?lang=eng"');
    expect(topical).not.toContain("study/scriptures/tg/born?lang=eng");
  });

  test("hides study helps when no guide has the word, and lists each guide to browse", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "xyzzy" }));
    expect(html).not.toContain(">Study helps<");
    expect(html).not.toContain('data-tone="sage"');
    for (const guide of ["bd", "gs", "tg"]) {
      expect(html).toContain(`href="https://www.churchofjesuschrist.org/study/scriptures/${guide}?lang=eng"`);
    }
    // The lexicons and dictionaries are still loading, so the word isn't declared missing yet.
    expect(headerOf(html, "Biblical languages")).toContain("Loading");
    expect(headerOf(html, "English meanings")).toContain("Loading");
    expect(html).not.toContain("Nothing found");
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

    const panel = renderToStaticMarkup(createElement(WordStudyPanel, { word: "faith", context: genesis }));
    expect(headerOf(panel, "Study helps")).toMatch(/>3<span class="[^"]*"> sources<\/span>/);
    // Hebrew has entries while Greek is still loading: the count is Hebrew's, and Greek stays offered.
    expect(headerOf(panel, "Biblical languages")).toMatch(/>\d+<span class="[^"]*"> match(es)?<\/span>/);
    expect(headerOf(panel, "Biblical languages")).toContain(">Hebrew · Greek · Genesis 1 interlinear<");
    expect(headerOf(panel, "English meanings")).toContain("Loading");

    // Each guide's entry, previewed in its own row; only the open row's entry shows.
    const previews = { bd: "Faith is to hope for things which are not seen", gs: "Confidence in something or someone.", tg: "children in whom is no <b class=\"font-semibold\">faith</b>" };
    for (const [guide, preview] of Object.entries(previews)) {
      const html = helpsOpen("faith", guide);
      expect(html).not.toContain("Loading Faith…");
      expect(html).toContain(preview);
      for (const other of Object.values(previews).filter((text) => text !== preview)) expect(html).not.toContain(other);
      expect(countOf(html, ">Read more<")).toBe(1);
      expect(countOf(html, ">Read at source<")).toBe(1);
      expect(countOf(html, 'data-explore-row="" aria-expanded="false"')).toBe(2);
    }
    // Scripture references open in the reader; topics of the same guide open in place.
    const allGuides = ["bd", "gs", "tg"].map((guide) => helpsOpen("faith", guide)).join("");
    expect(allGuides).toContain('<a class="rounded text-[color:var(--accent-rubric)]');
    expect(allGuides).toMatch(/<a [^>]*href="\/browse\/newtestament\/hebrews\/11#v-1"[^>]*>Heb\. 11:1<\/a>/);
    expect(allGuides).not.toMatch(/href="\/browse[^"]*"[^>]*target=/);
    expect(allGuides).toMatch(/<button type="button" class="[^"]*">Hope<\/button>/);

    // Strong's Hebrew results as rows, under how they matched, with the lemma isolated right to left; Greek is still loading.
    const languages = languagesOpen("faith", genesis);
    expect(languages).toContain("not the word in this verse");
    expect(languages).toContain("translated “faith” in the KJV");
    expect(languages).toMatch(/<span[^>]*>Hebrew · <span class="sr-only">Strong’s number <\/span>H530<\/span><span[^>]*><bdi lang="he" dir="rtl"[^>]*>אֱמוּנָה<\/bdi>/);
    expect(languages).not.toContain("KJV renders it");
    expect(languages).toContain("Strong’s Hebrew Dictionary, from");
    expect(languages).toContain("Looking up “faith” in Strong’s Greek dictionary…");
    expect(languages).not.toContain("πίστις");
    // Opening a result shows it in full: what it means, how the KJV renders it, and where it comes from.
    const entry = languagesOpen("faith", genesis, "hebrew:H530");
    expect(countOf(entry, 'data-explore-row="" aria-expanded="true"')).toBe(1);
    expect(countOf(entry, "KJV renders it")).toBe(1);
    expect(entry).toContain('href="https://biblehub.com/hebrew/530.htm"');
  });

  test("hides lexicons with no entries, keeps the chapter interlinear, and lists them to search elsewhere", async () => {
    vi.stubGlobal("fetch", async (input: string) => {
      const url = new URL(input, "http://localhost");
      const lookup = await lookupStrongs(url.searchParams.get("language") as "hebrew" | "greek", url.searchParams.get("term") ?? "");
      return Response.json({ ok: true, lookup });
    });
    try {
      await Promise.all([lexiconLookups.request("hebrew:xyzzy").promise, lexiconLookups.request("greek:xyzzy").promise]);
    } finally {
      vi.unstubAllGlobals();
    }

    const elsewhere = renderToStaticMarkup(createElement(WordStudyPanel, { word: "xyzzy", context: firstNephi }));
    expect(elsewhere).not.toContain(">Biblical languages<");
    for (const [label, page] of [["Hebrew", "searchhebrew"], ["Greek", "searchgreek"]]) {
      expect(elsewhere).toMatch(new RegExp(`<span>Strong’s ${label}</span><a href="https://biblehub\\.net/${page}\\.php\\?q=xyzzy"[^>]*target="_blank"`));
    }

    const inGenesis = renderToStaticMarkup(createElement(WordStudyPanel, { word: "xyzzy", context: genesis }));
    const header = headerOf(inGenesis, "Biblical languages");
    expect(header).toContain(">Genesis 1 interlinear<");
    expect(header).not.toContain("Loading");
    expect(header).not.toContain("match");
    const opened = languagesOpen("xyzzy", genesis);
    expect(opened).toContain('href="https://biblehub.com/interlinear/genesis/1.htm"');
    expect(opened).not.toContain("not the word in this verse");
    expect(opened).not.toContain("Strong’s Hebrew dictionary…");
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
