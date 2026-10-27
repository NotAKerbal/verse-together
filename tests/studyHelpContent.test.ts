import { afterEach, describe, expect, test } from "vitest";
import { bdFaithPage, gsFaithPage, tgFaithPage } from "./fixtures/studyHelpPages";
import {
  StudyHelpRequestError,
  clearStudyHelpCache,
  fetchStudyHelpEntry,
  isPublishedStudyHelpTopic,
  loadStudyHelpEntry,
  parseStudyHelpPage,
  safeChurchUrl,
} from "../src/lib/studyHelpContent.server";
import { inlineText, previewStudyHelpBlocks, type StudyHelpBlock, type StudyHelpInline } from "../src/lib/studyHelpContent";

type Link = Extract<StudyHelpInline, { href: string }>;

function links(nodes: StudyHelpInline[]): Link[] {
  return nodes.flatMap((node) => (typeof node === "string" ? [] : "href" in node ? [node, ...links(node.children)] : links(node.children)));
}
function blockInline(block: StudyHelpBlock): StudyHelpInline[] {
  return block.type === "list" ? block.items.flat() : block.content;
}
const allText = (blocks: StudyHelpBlock[]) => blocks.map((block) => inlineText(blockInline(block))).join("\n");
const allLinks = (blocks: StudyHelpBlock[]) => blocks.flatMap((block) => links(blockInline(block)));

function page(article: string, uri = "/scriptures/bd/faith") {
  return `<html><body><nav><a href="/study/scriptures/bd/aaron">Aaron</a></nav><article data-uri="${uri}" id="main"><div class="body"><header><h1>Faith</h1></header><div class="body-block">${article}</div></div></article></body></html>`;
}

describe("reading an official study helps page", () => {
  test("keeps the Bible Dictionary article's paragraphs and scripture references, and nothing outside it", () => {
    const entry = parseStudyHelpPage(bdFaithPage, "bd", "faith");
    expect(entry).toMatchObject({ guide: "bd", slug: "faith", title: "Faith", truncated: false });
    expect(entry.url).toBe("https://www.churchofjesuschrist.org/study/scriptures/bd/faith?lang=eng");
    expect(entry.blocks.map((block) => block.type)).toEqual(["paragraph", "paragraph", "paragraph", "paragraph", "paragraph"]);
    const text = allText(entry.blocks);
    expect(text).toMatch(/^Faith is to hope for things which are not seen, but which are true \(Heb\. 11:1; Alma 32:21\)/);
    for (const leaked of ["SCRIPT-TEXT", "STYLE-TEXT", "Site navigation", "Privacy Notice", "Introduction", "Aaron"]) {
      expect(text).not.toContain(leaked);
    }
    const hebrews = allLinks(entry.blocks).find((link) => inlineText(link.children) === "Heb. 11:1");
    expect(hebrews).toEqual({
      href: "https://www.churchofjesuschrist.org/study/scriptures/nt/heb/11?lang=eng&id=p1#p1",
      appHref: "/browse/newtestament/hebrews/11#v-1",
      children: ["Heb. 11:1"],
    });
    // "JST Gen. 14:26–36 (Appendix)" keeps its small-caps label; the app has no JST reader, so it stays a source link.
    const jst = allLinks(entry.blocks).find((link) => link.href.includes("/jst/"));
    expect(jst?.children).toEqual([{ mark: "small", children: ["JST"] }, " Gen. 14:26–36 (Appendix)"]);
    expect(jst?.appHref).toBeUndefined();
  });

  test("reads the Guide to the Scriptures' See also line, definition, and grouped references", () => {
    const entry = parseStudyHelpPage(gsFaithPage, "gs", "faith");
    const [seeAlso, definition] = entry.blocks;
    expect(seeAlso).toMatchObject({ type: "paragraph", style: "title" });
    expect(inlineText(blockInline(seeAlso))).toBe("See also Belief, Believe; Hope; Jesus Christ; Trust");
    expect(blockInline(seeAlso)[0]).toEqual({ mark: "em", children: ["See also"] });
    expect(links(blockInline(seeAlso)).map((link) => link.topic)).toEqual([
      { guide: "gs", slug: "belief-believe" },
      { guide: "gs", slug: "hope" },
      { guide: "gs", slug: "jesus-christ" },
      { guide: "gs", slug: "trust" },
    ]);
    expect(inlineText(blockInline(definition))).toMatch(/^Confidence in something or someone\./);
    const lists = entry.blocks.filter((block) => block.type === "list");
    expect(lists.length).toBeGreaterThanOrEqual(2);
    expect(lists.every((list) => list.type === "list" && list.items.length > 0)).toBe(true);
  });

  test("keeps the Topical Guide's quoted phrases with their keyword and references", () => {
    const entry = parseStudyHelpPage(tgFaithPage, "tg", "faith");
    const seeAlso = entry.blocks[0];
    const seeAlsoLinks = links(blockInline(seeAlso));
    // A See also topic in another guide ("BD Faith") keeps its own guide, so it is never opened as a Topical Guide topic.
    expect(seeAlsoLinks.at(-1)).toMatchObject({ href: "https://www.churchofjesuschrist.org/study/scriptures/bd/faith?lang=eng", topic: { guide: "bd", slug: "faith" } });
    expect(seeAlsoLinks[0].topic).toEqual({ guide: "tg", slug: "assurance" });
    const firstList = entry.blocks.find((block) => block.type === "list");
    expect(firstList?.type === "list" && firstList.items[0]).toEqual([
      "children in whom is no ",
      { mark: "key", children: ["faith"] },
      ", ",
      {
        href: "https://www.churchofjesuschrist.org/study/scriptures/ot/deut/32?lang=eng&id=p20#p20",
        appHref: "/browse/oldtestament/deuteronomy/32#v-20",
        children: ["Deut. 32:20"],
      },
      ".",
    ]);
    expect(firstList?.type === "list" && inlineText(firstList.items[1])).toBe("the just shall live by his faith, Hab. 2:4 (Rom. 1:17; Gal. 3:11; Heb. 10:38).");
  });

  test("rejects a page that is not this entry's article", () => {
    expect(() => parseStudyHelpPage(bdFaithPage, "bd", "hope")).toThrow(/no \/scriptures\/bd\/hope article/);
    expect(() => parseStudyHelpPage(bdFaithPage, "gs", "faith")).toThrow();
    expect(() => parseStudyHelpPage("<html><body><h1>Faith</h1><p>Something went wrong</p></body></html>", "bd", "faith")).toThrow();
    expect(() => parseStudyHelpPage(page(""), "bd", "faith")).toThrow(/no text/);
  });

  test("drops active content and unsafe links, keeping only text", () => {
    const entry = parseStudyHelpPage(
      page(`
        <p onclick="steal()">Safe <script>alert("x")</script><style>p{}</style>text
          <img src=x onerror="steal()"><iframe src="https://evil.example"></iframe><svg><text>svg text</text></svg>
          <a href="javascript:alert(1)">script link</a> <a href="https://evil.example/study/scriptures/bd/aaron">lookalike</a>
          <a href="//evil.example/x">protocol-relative</a> <a href="https://www.churchofjesuschrist.org.evil.example/">suffix</a>
          <a href="https://user@www.churchofjesuschrist.org/study">credentials</a> <a href="data:text/html,hi">data</a>
          <a href="/study/scriptures/bd/aaron?lang=eng" onmouseover="steal()" style="color:red">Aaron</a></p>
        <form><input value="form text"><button>Press</button></form>
        <p>  </p>`),
      "bd",
      "faith"
    );
    expect(entry.blocks).toHaveLength(1);
    const text = allText(entry.blocks);
    expect(text.replace(/\s+/g, " ")).toBe("Safe text script link lookalike protocol-relative suffix credentials data Aaron");
    expect(allLinks(entry.blocks)).toEqual([
      { href: "https://www.churchofjesuschrist.org/study/scriptures/bd/aaron?lang=eng", topic: { guide: "bd", slug: "aaron" }, children: ["Aaron"] },
    ]);
    expect(JSON.stringify(entry)).not.toMatch(/steal|onclick|onerror|style|evil|javascript/);
  });

  test("resolves relative links on the Church's site and nothing else", () => {
    expect(safeChurchUrl("/study/scriptures/nt/heb/11?lang=eng")?.href).toBe("https://www.churchofjesuschrist.org/study/scriptures/nt/heb/11?lang=eng");
    expect(safeChurchUrl("https://churchofjesuschrist.org/study")?.hostname).toBe("churchofjesuschrist.org");
    for (const href of ["http://www.churchofjesuschrist.org/study", "https://www.churchofjesuschrist.org:8443/", "javascript:alert(1)", "//evil.example/", "https://evil.example/", undefined]) {
      expect(safeChurchUrl(href)).toBeNull();
    }
  });

  test("reads headings and list items of other entries, and caps an overlong entry", () => {
    const items = Array.from({ length: 700 }, (_, index) => `<li><p class="entry">phrase ${index}</p></li>`).join("");
    const entry = parseStudyHelpPage(page(`<h2>Old Testament</h2><nav class="index"><ul>${items}</ul></nav>`), "bd", "faith");
    expect(entry.blocks[0]).toEqual({ type: "heading", content: ["Old Testament"] });
    expect(entry.truncated).toBe(true);
    const listed = entry.blocks.flatMap((block) => (block.type === "list" ? block.items : []));
    expect(listed.length).toBe(600);
  });
});

describe("previewing an entry", () => {
  test("shows the opening and keeps the rest for Read more", () => {
    const gs = parseStudyHelpPage(gsFaithPage, "gs", "faith");
    const preview = previewStudyHelpBlocks(gs.blocks);
    expect(preview.hasMore).toBe(true);
    expect(preview.blocks.length).toBeLessThan(gs.blocks.length);
    expect(allText(preview.blocks).length).toBeLessThan(allText(gs.blocks).length);
    expect(allText(preview.blocks)).toContain("See also Belief, Believe");

    const tg = previewStudyHelpBlocks(parseStudyHelpPage(tgFaithPage, "tg", "faith").blocks);
    const shownItems = tg.blocks.flatMap((block) => (block.type === "list" ? block.items : []));
    expect(shownItems.length).toBeGreaterThan(0);
    expect(shownItems.length).toBeLessThanOrEqual(3);
  });

  test("leaves room for the opening after a long See also line", () => {
    const seeAlso = Array.from({ length: 40 }, (_, index) => `Topic ${index}`).join("; ");
    const blocks: StudyHelpBlock[] = [
      { type: "paragraph", style: "title", content: [`See also ${seeAlso}`] },
      { type: "paragraph", content: ["The entry's own opening."] },
      { type: "paragraph", content: ["x".repeat(800)] },
    ];
    const preview = previewStudyHelpBlocks(blocks);
    expect(allText(preview.blocks)).toContain("The entry's own opening.");
    expect(allText(preview.blocks).length).toBeLessThanOrEqual(483);
    expect(allText(blocks)).toContain(seeAlso);
    expect(preview.hasMore).toBe(true);
  });

  test("shortens a long opening without losing its links or changing the full article", () => {
    const blocks: StudyHelpBlock[] = [{
      type: "paragraph",
      content: ["An opening with ", { href: "https://www.churchofjesuschrist.org/study/scriptures/gs/faith", children: ["a reference"] }, " and a detailed explanation".repeat(60)],
    }];
    const original = JSON.stringify(blocks);
    const preview = previewStudyHelpBlocks(blocks);
    expect(preview.hasMore).toBe(true);
    expect(allText(preview.blocks).length).toBeLessThanOrEqual(481);
    expect(allText(preview.blocks)).toMatch(/^An opening with a reference/);
    expect(allText(preview.blocks)).toMatch(/…$/);
    expect(allLinks(preview.blocks)[0].children).toEqual(["a reference"]);
    expect(JSON.stringify(blocks)).toBe(original);
  });

  test("shows a short entry whole", () => {
    const blocks: StudyHelpBlock[] = [{ type: "paragraph", content: ["A short entry."] }];
    expect(previewStudyHelpBlocks(blocks)).toEqual({ blocks, hasMore: false });
  });
});

describe("fetching an entry", () => {
  afterEach(() => clearStudyHelpCache());

  const htmlResponse = (body: string, init: ResponseInit = {}) =>
    new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });

  test("accepts only published topics of the three guides", async () => {
    expect(isPublishedStudyHelpTopic("bd", "faith")).toBe(true);
    expect(isPublishedStudyHelpTopic("tg", "lord-1")).toBe(true);
    for (const [guide, slug] of [["bd", "not-a-topic"], ["xx", "faith"], ["bd", "../faith"], ["bd", "faith?x=1"], ["bd", null], [null, "faith"]]) {
      expect(isPublishedStudyHelpTopic(guide, slug)).toBe(false);
    }
    let called = false;
    const fetchSpy = async () => {
      called = true;
      return htmlResponse(bdFaithPage);
    };
    await expect(fetchStudyHelpEntry("bd", "not-a-topic", { fetch: fetchSpy })).rejects.toMatchObject({ status: 404 });
    expect(called).toBe(false);
  });

  test("requests only the official entry URL", async () => {
    const requested: string[] = [];
    const entry = await fetchStudyHelpEntry("bd", "faith", {
      fetch: async (url) => {
        requested.push(url);
        return htmlResponse(bdFaithPage);
      },
    });
    expect(requested).toEqual(["https://www.churchofjesuschrist.org/study/scriptures/bd/faith?lang=eng"]);
    expect(entry.title).toBe("Faith");
  });

  test("reports missing entries, upstream failures, and the wrong content", async () => {
    const attempt = (response: Response) => fetchStudyHelpEntry("bd", "faith", { fetch: async () => response });
    await expect(attempt(htmlResponse("", { status: 404 }))).rejects.toMatchObject({ status: 404 });
    await expect(attempt(htmlResponse("", { status: 500 }))).rejects.toMatchObject({ status: 502 });
    await expect(attempt(new Response("{}", { headers: { "content-type": "application/json" } }))).rejects.toMatchObject({ status: 502 });
    // A generic page that answers 200 is not the entry.
    await expect(attempt(htmlResponse("<html><body><h1>Gospel Library</h1></body></html>"))).rejects.toMatchObject({ status: 502 });
    await expect(attempt(htmlResponse(tgFaithPage))).rejects.toBeInstanceOf(StudyHelpRequestError);
    await expect(fetchStudyHelpEntry("bd", "faith", { fetch: async () => { throw new TypeError("network"); } })).rejects.toMatchObject({ status: 502 });
  });

  test("gives up on a slow or oversized page", async () => {
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    await expect(fetchStudyHelpEntry("bd", "faith", { fetch: hang, timeoutMs: 20 })).rejects.toMatchObject({ status: 504 });
    await expect(fetchStudyHelpEntry("bd", "faith", { fetch: async () => htmlResponse(bdFaithPage), maxBytes: 1024 })).rejects.toThrow(/too large/);
  });

  test("shares one request per entry and keeps successes but not failures", async () => {
    let calls = 0;
    let fail = true;
    const fetchImpl = async () => {
      calls += 1;
      return fail ? htmlResponse("", { status: 503 }) : htmlResponse(bdFaithPage);
    };
    const failed = await Promise.allSettled([loadStudyHelpEntry("bd", "faith", { fetch: fetchImpl }), loadStudyHelpEntry("bd", "faith", { fetch: fetchImpl })]);
    expect(failed.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toBe(1);
    fail = false;
    const [first, second] = await Promise.all([loadStudyHelpEntry("bd", "faith", { fetch: fetchImpl }), loadStudyHelpEntry("bd", "faith", { fetch: fetchImpl })]);
    expect(calls).toBe(2);
    expect(second).toBe(first);
    await loadStudyHelpEntry("bd", "faith", { fetch: fetchImpl });
    expect(calls).toBe(2);
  });
});
