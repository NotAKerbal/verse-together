import { decodeBibleTargetToHref, dictionaryBlocks, dictionaryPlainText } from "../src/features/explore/dictionaryText";
import {
  biblicalLanguagePlan,
  dictionaryLookups,
  englishResults,
  explorePhrase,
  exploreTerm,
  exploreWords,
  languagesStatus,
  lookupDictionary,
  lookupLexicon,
  lookupStudyHelp,
  noMatches,
  studyHelpBlocks,
  studyHelpMatches,
  studyHelpResults,
} from "../src/features/explore/explore";
import { getJson, NetworkError } from "../src/features/explore/network";
import { canCompare, loadComparison, normalizeCompareText, sortTranslations } from "../src/features/explore/translations";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe("Explore", () => {
  it("offers the selection's meaningful words once each", () => {
    expect(exploreWords("And now as I said concerning faith--faith is not to have a perfect knowledge of things")).toEqual(["concerning", "faith", "perfect", "knowledge", "things"]);
  });

  it("matches study helps topics from the committed index", () => {
    const matches = studyHelpMatches("faith");
    expect(matches.map((guide) => guide.guide)).toEqual(["bd", "gs", "tg"]);
    expect(matches.find((guide) => guide.guide === "bd")?.entries[0]).toEqual({ title: "Faith", slug: "faith" });
  });

  it("turns entry text into blocks whose scripture links open in the app", () => {
    const blocks = studyHelpBlocks([
      { type: "paragraph", content: ["Faith is to hope (", { href: "https://www.churchofjesuschrist.org/study/scriptures/nt/heb/11?lang=eng", appHref: "/browse/newtestament/hebrews/11#v-1", children: ["Heb. 11:1"] }, ")."] },
    ]);
    expect(blocks[0]).toEqual({ kind: "p", runs: [{ text: "Faith is to hope (" }, { text: "Heb. 11:1", path: "/browse/newtestament/hebrews/11?verse=1" }, { text: ")." }] });
  });

  it("reports an offline device and server errors in plain words", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    await expect(lookupDictionary("faith")).rejects.toMatchObject({ kind: "offline", message: expect.stringContaining("Check your internet connection") });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ ok: false, error: "Unknown study helps topic." }) } as Response);
    await expect(lookupStudyHelp("bd", "nope")).rejects.toThrow("Unknown study helps topic.");
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } } as unknown as Response);
    await expect(getJson("https://example.invalid")).rejects.toBeInstanceOf(NetworkError);
  });

  it("rejects a late body after cancellation even when the transport ignores abort", async () => {
    const controller = new AbortController();
    let finish!: (body: unknown) => void;
    const body = new Promise((resolve) => { finish = resolve; });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => body } as unknown as Response);
    const pending = getJson("https://example.invalid", 1000, controller.signal);
    await Promise.resolve();
    controller.abort();
    finish({ ok: true });
    await expect(pending).rejects.toMatchObject({ kind: "aborted" });
  });

  it("times out a request that never answers", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(() => new Promise<Response>(() => {}));
    const pending = getJson("https://example.invalid", 1000);
    jest.advanceTimersByTime(1001);
    await expect(pending).rejects.toMatchObject({ kind: "timeout" });
    jest.useRealTimers();
  });
});

describe("Explore's selection", () => {
  it("keeps the displayed selection exact and normalizes only the lookup term", () => {
    expect(explorePhrase("  his compassions\n fail not. ")).toBe("his compassions\n fail not.");
    expect(exploreTerm("“Holy Ghost,”")).toBe("holy ghost");
    expect(exploreTerm("faith—faith is not")).toBe("faith—faith is not");
    expect(exploreTerm("Alma’s")).toBe("alma’s");
    expect(explorePhrase("—")).toBe("—");
    expect(exploreTerm("—")).toBe("");
  });

  it("matches study helps for a phrase, not its first word", () => {
    const phrase = studyHelpResults("holy ghost");
    const bd = phrase.find((result) => result.guide.id === "bd")!;
    expect(bd.matches.entries[0]).toEqual({ title: "Holy Ghost", slug: "holy-ghost" });
    expect(studyHelpResults("holy").find((result) => result.guide.id === "bd")!.matches.entries[0]?.slug).not.toBe("holy-ghost");
  });
});

describe("Explore's sources", () => {
  it("orders the languages by the testament read, and links the chapter's interlinear only for the Bible", () => {
    expect(biblicalLanguagePlan("Faith", { volume: "newtestament", book: "hebrews", chapter: 11 })).toEqual({
      term: "faith",
      searchable: true,
      interlinear: { url: "https://biblehub.com/interlinear/hebrews/11.htm", passage: "Hebrews 11", testament: "new" },
      order: ["greek", "hebrew"],
    });
    const lamentations = biblicalLanguagePlan("his compassions fail not", { volume: "oldtestament", book: "lamentations", chapter: 3 });
    expect(lamentations).toMatchObject({ term: "his compassions fail not", order: ["hebrew", "greek"], interlinear: { passage: "Lamentations 3", url: "https://biblehub.com/interlinear/lamentations/3.htm" } });
    expect(biblicalLanguagePlan("faith", { volume: "oldtestament", book: "1samuel", chapter: 3 }).interlinear?.url).toBe("https://biblehub.com/interlinear/1_samuel/3.htm");
    expect(biblicalLanguagePlan("faith", { volume: "bookofmormon", book: "alma", chapter: 32 }).interlinear).toBeNull();
    expect(biblicalLanguagePlan("faith", { volume: "oldtestament", book: "lamentations", chapter: 6 }).interlinear).toBeNull();
    expect(biblicalLanguagePlan("x".repeat(65), null).searchable).toBe(false);
    // An interlinear is something to show even when Strong's had nothing.
    expect(languagesStatus(["empty", "empty"], biblicalLanguagePlan("x", { volume: "oldtestament", book: "isaiah", chapter: 40 }).interlinear)).toBe("found");
    expect(languagesStatus(["empty", "empty"], null)).toBe("empty");
    expect(languagesStatus(["loading", "empty"], null)).toBe("loading");
  });

  it("shows every dictionary edition in order, then word histories, and names what had nothing", () => {
    const entry = (id: string, edition: "1828" | "1913") => ({ id, edition, word: "grace", heading: null, entryText: "x", pronounce: null });
    const english = englishResults({
      status: "ready",
      payload: {
        ok: true,
        enabled: true,
        byEdition: { "1913": { entries: [entry("b", "1913")] }, "1828": { entries: [entry("a", "1828")] }, "1844": null },
        providerLabels: { "1828": "Merriam-Webster", "1913": "Free Dictionary API" },
        etymology: { items: [] },
      },
    });
    expect(english.status).toBe("found");
    expect(english.dictionaryGroups.map((group) => [group.edition, group.source])).toEqual([["1828", "Merriam-Webster"], ["1913", "Free Dictionary API"]]);
    expect(englishResults({ status: "error", message: "x" }).status).toBe("error");
    expect(englishResults({ status: "ready", payload: { ok: true, enabled: true } }).status).toBe("empty");

    const missing = noMatches({
      helps: studyHelpResults("grace").map((result) => (result.guide.id === "tg" ? { ...result, status: "empty" as const } : result)),
      languages: [{ key: "hebrew", status: "empty" }, { key: "greek", status: "found" }],
      lexicon: { term: "grace", searchable: true },
      english,
    });
    expect(missing).toEqual([
      { id: "tg", label: "Topical Guide", link: { url: "https://www.churchofjesuschrist.org/study/scriptures/tg?lang=eng", text: "Browse", a11y: "Browse the Topical Guide" } },
      { id: "hebrew", label: "Strong’s Hebrew", link: { url: "https://biblehub.net/searchhebrew.php?q=grace", text: "Search Bible Hub", a11y: "Search Bible Hub’s Hebrew lexicon" } },
      { id: "etymology", label: "Word histories" },
    ]);
  });

  it("asks each API for exactly the term, and treats a disabled dictionary as a failure to retry", async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return { ok: true, status: 200, json: async () => (String(url).includes("dictionary") ? { ok: true, enabled: false } : { ok: true, lookup: { language: "greek", term: "holy ghost", matches: [], total: 0, attribution: { title: "", sourceUrl: "", license: "" } } }) } as Response;
    }) as typeof fetch;
    await expect(lookupLexicon("greek", "holy ghost")).resolves.toMatchObject({ term: "holy ghost" });
    await expect(lookupDictionary("holy ghost")).rejects.toThrow("The dictionary isn't available right now");
    expect(urls).toEqual([
      "https://www.versetogether.org/api/tools/lexicon?language=greek&term=holy%20ghost",
      "https://www.versetogether.org/api/tools/dictionary?term=holy%20ghost",
    ]);
  });

  it("cancels a shared lookup once no one wants it, and never keeps a failure", async () => {
    const signals: AbortSignal[] = [];
    global.fetch = jest.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init!.signal!);
      return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("aborted"))));
    }) as typeof fetch;
    const first = dictionaryLookups.request("cancel-me");
    const second = dictionaryLookups.request("cancel-me");
    expect(signals).toHaveLength(1);
    first.release();
    expect(signals[0].aborted).toBe(false);
    second.release();
    expect(signals[0].aborted).toBe(true);
    await expect(first.promise).rejects.toMatchObject({ kind: "aborted" });
    expect(dictionaryLookups.peek("cancel-me")).toBeUndefined();
  });

  it("says plainly when the service refuses, rate-limits, or answers with a page that isn't JSON", async () => {
    const answer = (status: number, body?: unknown) =>
      jest.fn().mockResolvedValue({ ok: status < 300, status, json: async () => (body === undefined ? Promise.reject(new SyntaxError("<html>")) : body) } as unknown as Response) as typeof fetch;
    global.fetch = answer(403);
    await expect(getJson("https://example.invalid")).rejects.toMatchObject({ kind: "http", status: 403, message: "Verse Together declined the request (403). Try again later." });
    global.fetch = answer(429, {});
    await expect(getJson("https://example.invalid")).rejects.toMatchObject({ message: "Too many lookups at once. Wait a moment and try again." });
    global.fetch = answer(502);
    await expect(getJson("https://example.invalid")).rejects.toMatchObject({ message: expect.stringContaining("couldn't answer right now (502)") });
    const controller = new AbortController();
    controller.abort();
    await expect(getJson("https://example.invalid", 1000, controller.signal)).rejects.toMatchObject({ kind: "aborted" });
  });
});

describe("dictionary entry text", () => {
  it("reads the web's markup as the web shows it: lines kept, citations set apart", () => {
    const blocks = dictionaryBlocks('<pos>noun</pos>\n1. Trust in God.\n<cd>Example:</cd> "faith of our fathers"\n<sd>Synonyms:</sd> - belief\n- trust\n— Shakespeare.');
    expect(blocks).toHaveLength(1);
    const runs = blocks[0].kind === "p" ? blocks[0].runs : [];
    expect(runs.map((run) => run.text).join("")).toBe('noun\n1. Trust in God.\nExample: "faith of our fathers"\nSynonyms: - belief\n- trust\n— Shakespeare.');
    // The web's normalizing pass keeps only plain <span>s for parts of speech and labels (DictionaryEntryBody.tsx).
    expect(runs.some((run) => run.role === "pos")).toBe(false);
    expect(runs.find((run) => run.role === "cite")).toEqual({ role: "cite", text: "— Shakespeare." });
    expect(dictionaryBlocks("<b>Faith</b>, <i>n.</i> [uCode:x]")[0]).toEqual({
      kind: "p",
      runs: [{ bold: true, text: "Faith" }, { text: ", " }, { italic: true, text: "n." }, { text: " " }, { mark: true, text: "[uCode:x]" }],
    });
  });

  it("turns See references and underlined terms into look-ups, Bible targets into passages, and refuses script links", () => {
    const see = dictionaryBlocks("Belief. See Trust, Hope, etc.")[0];
    expect(see.kind === "p" && see.runs.filter((run) => run.seeTerm).map((run) => run.seeTerm)).toEqual(["Trust", "Hope"]);
    const underlined = dictionaryBlocks("compare <u>credence</u>")[0];
    expect(underlined.kind === "p" && underlined.runs.find((run) => run.seeTerm)).toEqual({ seeTerm: "credence", text: "credence" });
    expect(decodeBibleTargetToHref("58011001")).toBe("/browse/newtestament/hebrews/11#v-1");
    expect(decodeBibleTargetToHref("19023001")).toBe("/browse/oldtestament/psalms/23#v-1");
    expect(decodeBibleTargetToHref("67001001")).toBeNull();
    const bible = dictionaryBlocks('As in <a class="bible" target="58011001">Heb. 11:1</a>.')[0];
    expect(bible.kind === "p" && bible.runs.find((run) => run.href)).toEqual({ href: "/browse/newtestament/hebrews/11#v-1", bible: true, text: "Heb. 11:1" });
    const script = dictionaryBlocks('<a href="javascript:alert(1)">x</a> and <script>bad()</script>')[0];
    expect(script.kind === "p" && script.runs.some((run) => run.href)).toBe(false);
    expect(script.kind === "p" && script.runs.filter((run) => run.mark).map((run) => run.text)).toEqual(['<a href="javascript:alert(1)">', "<script>", "</script>"]);
  });

  it("keeps quotes and numbered lists, and writes the entry as plain text for a note", () => {
    const raw = "Firm belief.<blockquote>Faith is the substance.\n-- Hebrews.</blockquote><ol class=\"numbers\"><li>Trust</li><li>Fidelity</li></ol>";
    const blocks = dictionaryBlocks(raw);
    expect(blocks.map((block) => block.kind)).toEqual(["p", "quote", "list"]);
    const list = blocks[2];
    expect(list.kind === "list" && list.ordered && list.items.map((item) => item.map((run) => run.text).join(""))).toEqual(["Trust", "Fidelity"]);
    expect(dictionaryPlainText(raw)).toBe("Firm belief.\n\n> Faith is the substance.\n> -- Hebrews.\n\n1. Trust\n2. Fidelity");
  });
});

describe("translations", () => {
  it("compares only Bible chapters, ignoring punctuation and case", () => {
    expect(canCompare("oldtestament", "isaiah")).toBe(true);
    expect(canCompare("bookofmormon", "alma")).toBe(false);
    expect(normalizeCompareText("In the beginning, God")).toBe(normalizeCompareText("in the beginning God"));
    const sorted = sortTranslations(
      [
        { id: "spa_rvg", name: "Reina Valera", language: "spa" },
        { id: "BSB", name: "Berean Standard Bible", englishName: "Berean Standard Bible", language: "eng" },
      ],
      ""
    );
    expect(sorted[0].id).toBe("BSB");
  });

  it("says when a chapter can't be loaded", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    await expect(loadComparison("genesis", 1, "BSB")).rejects.toThrow("Couldn't load this chapter in that translation");
  });
});
