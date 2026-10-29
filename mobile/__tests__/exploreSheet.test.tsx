import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { BackHandler } from "react-native";
import * as Blocks from "../src/components/Blocks";
import { studyHelpResults } from "../src/features/explore/explore";
import * as draftIntent from "../src/features/journal/draftIntent";
import { faithTradition } from "../src/storage/faithTradition";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { lastPosition, readerPreferences } from "../src/storage/preferences";
import { initDeviceStudy } from "../src/storage/study";
import { resetNativeCalls, selectText } from "../testing/scriptureText";

// Explore on the app's real routes (the reader and a two-book lesson), from a selection made through the native
// scripture text's onSelectionChange event (a mocked bridge, jest.setup.js), against a fetch that answers like the
// Verse Together API (/api/tools/dictionary, /lexicon, /study-helps) and honors abort signals as fetch does. These
// verify the app's requests, states and actions, not a phone's network or gestures.

type Call = { url: URL; signal?: AbortSignal | null };
type Reply = { status?: number; body?: unknown } | Error | "pending";
let calls: Call[] = [];
let route: (url: URL) => Reply;
const pendings: Array<{ url: URL; resolve: (response: Response) => void }> = [];

const respond = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

function installFetch() {
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, signal: init?.signal });
    const reply = route(url);
    if (reply instanceof Error) return Promise.reject(reply);
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })));
      if (reply === "pending") pendings.push({ url, resolve });
      else resolve(respond(reply.body, reply.status));
    });
  }) as typeof fetch;
}

const callsTo = (path: string) => calls.filter((call) => call.url.pathname === `/api/tools/${path}`);
const param = (call: Call, name: string) => call.url.searchParams.get(name);
/** Explore's own lookups, not the reader's (its chapter study paths, /api/insights/chapter). */
const toolCalls = () => calls.filter((call) => call.url.pathname.startsWith("/api/tools/"));

const EMPTY_DICTIONARY = (term: string) => ({
  ok: true,
  enabled: true,
  term,
  byEdition: { "1828": null, "1844": null, "1913": null },
  providerLabels: { "1828": "Merriam-Webster", "1844": "Unavailable", "1913": "Free Dictionary API" },
  etymology: { items: [] },
});
const EMPTY_LEXICON = (language: string, term: string) => ({
  ok: true,
  lookup: { language, term, matches: [], total: 0, attribution: { title: `Strong’s ${language === "hebrew" ? "Hebrew" : "Greek"} Dictionary`, sourceUrl: "https://github.com/openscriptures/strongs", license: "CC-BY-SA (version not specified by upstream)" } },
});

/** Every lookup comes back empty unless a test says otherwise. */
function emptyRoute(url: URL): Reply {
  if (url.pathname === "/api/tools/dictionary") return { body: EMPTY_DICTIONARY(url.searchParams.get("term")!) };
  if (url.pathname === "/api/tools/lexicon") return { body: EMPTY_LEXICON(url.searchParams.get("language")!, url.searchParams.get("term")!) };
  return { status: 404, body: { ok: false, error: "Unknown study helps topic." } };
}

async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
  await settle();
}

async function settle(ms = 50) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

const realFetch = global.fetch;
beforeEach(() => {
  setStoragePort(memoryStorage());
  faithTradition.reset();
  readerPreferences.reset();
  lastPosition.reset();
  initDeviceStudy();
  resetNativeCalls();
  calls = [];
  pendings.length = 0;
  route = emptyRoute;
  installFetch();
  jest.spyOn(BackHandler, "addEventListener").mockImplementation(() => ({ remove: () => {} }));
});
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

async function exploreIn(path: string, phrase: string, options?: Parameters<typeof selectText>[1]) {
  await renderRouter("./app", { initialUrl: path });
  await screen.findByTestId("reader-text");
  await selectText(phrase, options);
  await press(screen.getByTestId("action-explore"));
  return screen.getByTestId("explore-sheet");
}

describe("Explore from the reader", () => {
  it("keeps the selection menu's actions in their order", async () => {
    await renderRouter("./app", { initialUrl: "/browse/newtestament/hebrews/11" });
    await screen.findByTestId("reader-text");
    await selectText("faith");
    const ids = within(screen.getByTestId("verse-actions")).getAllByTestId(/^action-/).map((element) => element.props.testID);
    // The web's order (VerseActionBar.tsx): Resources, for Latter-day Saint content, before Translations.
    expect(ids).toEqual(["action-explore", "action-journal", "action-annotate", "action-resources", "action-translations", "action-share", "action-copy"]);
  });

  it("looks up the whole selected phrase, never just its first word, and shows every dictionary edition and word history", async () => {
    route = (url) => {
      if (url.pathname === "/api/tools/dictionary" && url.searchParams.get("term") === "perfect knowledge") {
        return {
          body: {
            ...EMPTY_DICTIONARY("perfect knowledge"),
            byEdition: {
              "1828": { matchedKey: "perfect-knowledge", entries: [{ id: "mw-pk-0", edition: "1828", word: "perfect knowledge", heading: "Merriam-Webster Collegiate", entryText: "<pos>noun</pos>\n- complete understanding. See Knowledge", pronounce: null }] },
              "1844": null,
              "1913": {
                matchedKey: "perfect-knowledge",
                entries: [
                  { id: "free-pk-0", edition: "1913", word: "perfect knowledge", heading: null, entryText: "<pos>noun</pos>\n1. Knowledge without lack.\n<cd>Example:</cd> \"a perfect knowledge of things\"", pronounce: "/ˈpɜːfɪkt/" },
                  { id: "free-pk-1", edition: "1913", word: "perfect knowledge", heading: null, entryText: "Second sense.", pronounce: null },
                ],
              },
            },
            etymology: { items: [{ id: "free-ety-pk-0", source: "Free Dictionary API", word: "perfect", text: "From Latin perfectus, completed." }] },
          },
        };
      }
      if (url.pathname === "/api/tools/dictionary" && url.searchParams.get("term") === "knowledge") {
        return { body: { ...EMPTY_DICTIONARY("knowledge"), byEdition: { "1828": null, "1844": null, "1913": { entries: [{ id: "free-k-0", edition: "1913", word: "knowledge", heading: null, entryText: "The fact of knowing.", pronounce: null }] } } } };
      }
      return emptyRoute(url);
    };
    const sheet = await exploreIn("/browse/bookofmormon/alma/32", "perfect knowledge");
    expect(within(sheet).getByTestId("explore-subject")).toHaveTextContent("perfect knowledge");
    expect(within(sheet).getByText("Alma 32:21")).toBeTruthy();
    // One request per source, each for the exact phrase.
    expect(callsTo("dictionary").map((call) => param(call, "term"))).toEqual(["perfect knowledge"]);
    expect(callsTo("lexicon").map((call) => [param(call, "language"), param(call, "term")])).toEqual([["hebrew", "perfect knowledge"], ["greek", "perfect knowledge"]]);
    // The phrase's words are offered too, without changing what was looked up.
    expect(within(sheet).getByTestId("explore-choice-perfect")).toBeTruthy();
    expect(within(sheet).getByTestId("explore-choice-knowledge")).toBeTruthy();

    // Strong's had nothing and Alma isn't a Bible chapter: no languages section, and both lexicons are named as checked.
    expect(within(sheet).queryByTestId("explore-section-languages")).toBeNull();
    await press(within(within(sheet).getByTestId("explore-no-matches")).getByRole("button"));
    expect(within(sheet).getByText("Strong’s Hebrew")).toBeTruthy();
    expect(within(sheet).getByText("Strong’s Greek")).toBeTruthy();

    const english = within(sheet).getByTestId("explore-section-english");
    expect(within(english).getByText("4 entries")).toBeTruthy();
    await press(within(english).getByTestId("explore-section-english-toggle"));
    expect(within(english).getByText("Merriam-Webster")).toBeTruthy();
    expect(within(english).getByText("Free Dictionary API · entry 1")).toBeTruthy();
    expect(within(english).getByText("Free Dictionary API · entry 2")).toBeTruthy();
    expect(within(english).getByText("Word history · Free Dictionary API")).toBeTruthy();

    await press(within(english).getByTestId("dictionary-row-free-pk-0"));
    expect(within(english).getAllByText(/Knowledge without lack\./).length).toBeGreaterThan(0);
    expect(within(english).getByText("/ˈpɜːfɪkt/")).toBeTruthy();

    // Opening another result closes the first; a "See" reference looks its term up in place.
    await press(within(english).getByTestId("dictionary-row-mw-pk-0"));
    expect(within(english).queryByText(/Knowledge without lack\./)).toBeNull();
    await press(within(english).getByText("Knowledge"));
    await settle();
    const see = within(english).getByTestId("dictionary-see");
    expect(within(see).getByText("See: Knowledge")).toBeTruthy();
    expect(within(see).getByText("The fact of knowing.")).toBeTruthy();
  });

  it("adds a dictionary card to a new journal entry on the selected verse", async () => {
    route = (url) =>
      url.pathname === "/api/tools/dictionary"
        ? { body: { ...EMPTY_DICTIONARY("perfect"), byEdition: { "1828": null, "1844": null, "1913": { entries: [{ id: "free-perfect-0", edition: "1913", word: "perfect", heading: null, entryText: "<pos>adjective</pos>\n1. Complete; lacking nothing.", pronounce: "/ˈpɜːfɪkt/" }] } } } }
        : emptyRoute(url);
    const intent = jest.spyOn(draftIntent, "setDraftIntent");
    const sheet = await exploreIn("/browse/bookofmormon/alma/32", "perfect");
    await press(within(sheet).getByTestId("explore-section-english-toggle"));
    await press(within(sheet).getByTestId("dictionary-row-free-perfect-0"));
    await press(within(sheet).getByTestId("add-to-note-dictionary"));
    expect(intent).toHaveBeenCalledTimes(1);
    const draft = intent.mock.calls[0][0];
    expect(draft.body).toBe("### perfect\n\n*/ˈpɜːfɪkt/*\n\nadjective\n1. Complete; lacking nothing.\n\n— Free Dictionary API\n\n");
    expect(draft.source).toMatchObject({ kind: "scripture", volume: "bookofmormon", book: "alma", chapter: 32, verseStart: 21, verseEnd: 21 });
    expect(draft.reading).toBe(false);
    await waitFor(() => expect(screen).toHavePathname("/notes/new"));
  });

  it("says when it is offline, keeps the bundled study-help topics, and retries", async () => {
    route = () => new TypeError("Network request failed");
    const sheet = await exploreIn("/browse/bookofmormon/alma/32", "hope", { from: "21  " });
    // Topic matching is on the device: the study helps still show their topics.
    const helps = within(sheet).getByTestId("explore-section-helps");
    expect(within(helps).getByText("2 sources")).toBeTruthy();
    expect(within(within(sheet).getByTestId("explore-section-english")).getByText("Didn’t load")).toBeTruthy();
    expect(within(within(sheet).getByTestId("explore-section-languages")).getByText("Didn’t load")).toBeTruthy();

    await press(within(helps).getByTestId("explore-section-helps-toggle"));
    await press(within(helps).getByTestId("study-help-row-gs"));
    expect(within(helps).getAllByText(/didn’t load from the Guide to the Scriptures\. Couldn't connect\. Check your internet connection/).length).toBeGreaterThan(0);
    expect(within(helps).getByLabelText("Read at source")).toBeTruthy();

    await press(within(sheet).getByTestId("explore-section-english-toggle"));
    const english = within(sheet).getByTestId("explore-section-english");
    expect(within(english).getAllByText(/Couldn't connect\. Check your internet connection and try again\./).length).toBeGreaterThan(0);
    route = (url) =>
      url.pathname === "/api/tools/dictionary"
        ? { body: { ...EMPTY_DICTIONARY("hope"), etymology: { items: [{ id: "ety-hope", source: "Wiktionary", word: "hope", text: "From Old English hopa." }] } } }
        : emptyRoute(url);
    await press(within(english).getByLabelText("Try the dictionary again"));
    await settle();
    expect(within(english).getByText("Word history · Wiktionary")).toBeTruthy();
  });

  it("explains a refused lookup and a timeout in plain words", async () => {
    route = (url) => (url.pathname === "/api/tools/dictionary" ? { status: 429, body: undefined } : url.pathname === "/api/tools/lexicon" ? "pending" : emptyRoute(url));
    const sheet = await exploreIn("/browse/bookofmormon/alma/32", "seen", { from: "21  " });
    await press(within(sheet).getByTestId("explore-section-english-toggle"));
    expect(within(sheet).getAllByText(/Too many lookups at once\. Wait a moment and try again\./).length).toBeGreaterThan(0);
    // The lexicon never answers: after its time limit it says so, and its request is cancelled.
    await settle(15001);
    const languages = within(sheet).getByTestId("explore-section-languages");
    expect(within(languages).getByText("Didn’t load")).toBeTruthy();
    await press(within(languages).getByTestId("explore-section-languages-toggle"));
    expect(within(languages).getAllByText(/It took too long to answer\. Try again\./)).toHaveLength(2);
    expect(callsTo("lexicon").every((call) => call.signal?.aborted)).toBe(true);
  });

  it("cancels a lookup it no longer shows, and drops its late answer", async () => {
    route = (url) => (url.pathname === "/api/tools/study-helps" ? emptyRoute(url) : "pending");
    const sheet = await exploreIn("/browse/bookofmormon/alma/32", "things which are not seen", { from: "21  " });
    const first = toolCalls();
    expect(first.map((call) => param(call, "term"))).toEqual(["things which are not seen", "things which are not seen", "things which are not seen"]);

    await press(within(sheet).getByTestId("explore-choice-things"));
    expect(within(sheet).getByTestId("explore-subject")).toHaveTextContent("things");
    expect(first.every((call) => call.signal?.aborted)).toBe(true);
    const second = toolCalls().slice(first.length);
    expect(second.map((call) => param(call, "term"))).toEqual(["things", "things", "things"]);

    // The old phrase's answer arrives late: nothing of it shows.
    await act(async () => {
      for (const pending of pendings.filter((item) => item.url.searchParams.get("term") === "things which are not seen")) {
        pending.resolve(respond({ ...EMPTY_DICTIONARY("things which are not seen"), etymology: { items: [{ id: "stale", source: "Stale", word: "stale", text: "Stale." }] } }));
      }
    });
    expect(within(sheet).queryByText(/Stale/)).toBeNull();
    expect(within(within(sheet).getByTestId("explore-section-english")).getByText("Loading")).toBeTruthy();

    // Closing Explore cancels what is still loading.
    await press(within(sheet).getByLabelText("Close explore"));
    expect(second.every((call) => call.signal?.aborted)).toBe(true);
  });

  it("names a selection too long to look up whole, and offers its words", async () => {
    const sheet = await exploreIn("/browse/bookofmormon/alma/32", "therefore if ye have faith ye hope for things which are not seen, which are true.");
    expect(within(sheet).getByTestId("explore-subject")).toHaveTextContent("therefore if ye have faith ye hope for things which are not seen, which are true.");
    expect(callsTo("dictionary")).toHaveLength(0);
    expect(callsTo("lexicon")).toHaveLength(0);
    expect(within(sheet).getAllByText(/too long to look up as one phrase/).length).toBeGreaterThan(0);
    await press(within(within(sheet).getByTestId("explore-no-matches")).getByRole("button"));
    expect(within(sheet).getByText("English dictionaries (too long to look up)")).toBeTruthy();
    expect(within(sheet).getByText("Strong’s Hebrew (too long to look up)")).toBeTruthy();
    await press(within(sheet).getByTestId("explore-choice-therefore"));
    expect(callsTo("dictionary").map((call) => param(call, "term"))).toEqual(["therefore"]);
  });
});

describe("Explore's study helps and biblical languages in a Bible chapter", () => {
  const FAITH_ENTRY = {
    ok: true,
    entry: {
      guide: "bd",
      slug: "faith",
      title: "Faith",
      url: "https://www.churchofjesuschrist.org/study/scriptures/bd/faith?lang=eng",
      truncated: false,
      blocks: [
        {
          type: "paragraph",
          content: [
            "Faith is to hope (",
            { href: "https://www.churchofjesuschrist.org/study/scriptures/nt/heb/11?lang=eng&id=p1#p1", appHref: "/browse/newtestament/hebrews/11#v-1", children: ["Heb. 11:1"] },
            "). See also ",
            { href: "https://www.churchofjesuschrist.org/study/scriptures/bd/hope?lang=eng", topic: { guide: "bd", slug: "hope" }, children: ["Hope"] },
            ".",
          ],
        },
      ],
    },
  };
  const HOPE_ENTRY = { ok: true, entry: { ...FAITH_ENTRY.entry, slug: "hope", title: "Hope", url: "https://www.churchofjesuschrist.org/study/scriptures/bd/hope?lang=eng", blocks: [{ type: "paragraph", content: ["Hope is the confident expectation of promised blessings."] }] } };
  const lexicon = (language: string) => ({
    ok: true,
    lookup: {
      ...EMPTY_LEXICON(language, "faith").lookup,
      matches:
        language === "greek"
          ? [{ id: "G4102", lemma: "πίστις", transliteration: "pístis", pronunciation: "pis'-tis", definition: "persuasion, i.e. credence", derivation: "from G3982 (πείθω);", kjv: "assurance, belief, believe, faith, fidelity.", matchedIn: "kjv" }]
          : [{ id: "H530", lemma: "אֱמוּנָה", transliteration: "ʼĕmûwnâh", pronunciation: "em-oo-naw'", definition: "literally firmness; figuratively security; morally fidelity", derivation: "feminine of H529 (אֵמוּן);", kjv: "faith(-ful, -ly, -ness, (man)), set office, stability.", matchedIn: "kjv" }],
      total: 1,
    },
  });

  beforeEach(() => {
    route = (url) => {
      if (url.pathname === "/api/tools/study-helps") return url.searchParams.get("slug") === "hope" ? { body: HOPE_ENTRY } : { body: FAITH_ENTRY };
      if (url.pathname === "/api/tools/lexicon") return { body: lexicon(url.searchParams.get("language")!) };
      return emptyRoute(url);
    };
  });

  it("puts Greek first in the New Testament, with the chapter's interlinear", async () => {
    const opened = jest.spyOn(Blocks, "openExternal").mockResolvedValue(undefined);
    const sheet = await exploreIn("/browse/newtestament/hebrews/11", "faith");
    const languages = within(sheet).getByTestId("explore-section-languages");
    expect(within(languages).getByText("Greek · Hebrew · Hebrews 11 interlinear")).toBeTruthy();
    expect(within(languages).getByText("2 matches")).toBeTruthy();
    await press(within(languages).getByTestId("explore-section-languages-toggle"));
    expect(within(languages).getAllByText(/Possibilities to explore, not the word in this verse\./).length).toBeGreaterThan(0);
    const order = within(languages).getAllByTestId(/^lexicon-(greek|hebrew)$/).map((element) => element.props.testID);
    expect(order).toEqual(["lexicon-greek", "lexicon-hebrew"]);
    await press(within(languages).getByTestId("lexicon-row-G4102"));
    expect(within(languages).getByText("pis'-tis")).toBeTruthy();
    expect(within(languages).getAllByText(/assurance, belief, believe, faith, fidelity\./).length).toBeGreaterThan(0);
    await press(within(languages).getByLabelText("G4102 on Bible Hub"));
    expect(opened).toHaveBeenLastCalledWith("https://biblehub.com/greek/4102.htm");
    await press(within(languages).getByTestId("explore-interlinear"));
    expect(opened).toHaveBeenLastCalledWith("https://biblehub.com/interlinear/hebrews/11.htm");
  });

  it("leaves Latter-day Saint study helps out for Other denominations, in matches and in what found nothing", async () => {
    // For Latter-day Saint content "faith" finds topics, and some guides find none and are named as checked.
    const results = studyHelpResults("substance");
    const unmatched = results.filter((result) => result.status === "empty").map((result) => result.guide.label);
    expect(unmatched.length).toBeGreaterThan(0);
    faithTradition.set("other");
    const sheet = await exploreIn("/browse/newtestament/hebrews/11", "substance");
    expect(within(sheet).queryByTestId("explore-section-helps")).toBeNull();
    const none = within(sheet).getByTestId("explore-no-matches");
    await press(within(none).getByRole("button"));
    // Only the sources shown are counted and named as checked (Strong's found matches here); no study help guide is.
    expect(within(none).getByText("No matches for “substance” in 2 sources")).toBeTruthy();
    expect(within(sheet).getByText("English dictionaries")).toBeTruthy();
    expect(within(sheet).getByText("Word histories")).toBeTruthy();
    for (const label of results.map((result) => result.guide.label)) expect(within(sheet).queryByText(label)).toBeNull();
    // No study help topic is looked up.
    expect(callsTo("study-helps")).toEqual([]);
  });

  it("opens a guide's topic, a topic named in its text in place, and its scripture in the reader", async () => {
    const sheet = await exploreIn("/browse/newtestament/hebrews/11", "faith");
    const helps = within(sheet).getByTestId("explore-section-helps");
    await press(within(helps).getByTestId("explore-section-helps-toggle"));
    expect(within(helps).getByText("Bible Dictionary")).toBeTruthy();
    await press(within(helps).getByTestId("study-help-row-bd"));
    expect(callsTo("study-helps").map((call) => [param(call, "guide"), param(call, "slug")])).toEqual([["bd", "faith"]]);
    expect(within(helps).getAllByText(/Faith is to hope/).length).toBeGreaterThan(0);

    await press(within(helps).getByText("Hope"));
    await settle();
    expect(within(helps).getAllByText(/Hope is the confident expectation/).length).toBeGreaterThan(0);
    expect(within(helps).queryByText(/Faith is to hope/)).toBeNull();
  });

  it("follows an entry's scripture reference into the reader, closing Explore", async () => {
    const sheet = await exploreIn("/browse/newtestament/hebrews/11", "faith");
    await press(within(sheet).getByTestId("explore-section-helps-toggle"));
    await press(within(sheet).getByTestId("study-help-row-bd"));
    await press(within(sheet).getByText("Heb. 11:1"));
    await waitFor(() => expect(screen).toHavePathname("/browse/newtestament/hebrews/11"));
    expect(screen.queryByTestId("explore-sheet")).toBeNull();
  });
});

describe("Explore in a two-book lesson", () => {
  it("explores selected guide prose without carrying over the scripture's reference or interlinear", async () => {
    await renderRouter("./app", { initialUrl: "/come-follow-me/2026-10-26" });
    const lamentations = screen.getAllByTestId(/^guide-text-lamentations-3-/).find((view) => (view.props as { content: { text: string } }).content.text.includes("22  It is of the Lord's mercies"))!;
    await selectText("his compassions fail not.", { testID: lamentations.props.testID });
    const phrase = "Most of the discussion is my own close reading";
    const prose = screen.getAllByTestId(/^prose-/).find((view) => (view.props as { content: { text: string } }).content.text.includes(phrase))!;
    await selectText(phrase, { testID: prose.props.testID });
    await press(within(screen.getByTestId("guide-actions")).getByTestId("action-explore"));
    const sheet = screen.getByTestId("explore-sheet");
    expect(within(sheet).getByTestId("explore-subject")).toHaveTextContent(phrase);
    expect(within(sheet).getByText("Study guide")).toBeTruthy();
    expect(within(sheet).queryByText("Lamentations 3:22")).toBeNull();
    expect(within(sheet).queryByTestId("explore-interlinear")).toBeNull();
    expect(callsTo("dictionary").map((call) => param(call, "term"))).toEqual([phrase.toLowerCase()]);
  });

  it("explores Lamentations' words as Lamentations, with its own reference and interlinear", async () => {
    await renderRouter("./app", { initialUrl: "/come-follow-me/2026-10-26" });
    expect((await screen.findAllByText(/I Will Turn Their Mourning into Joy/)).length).toBeGreaterThan(0);
    const lamentations = screen.getAllByTestId(/^guide-text-lamentations-3-/).find((view) => (view.props as { content: { text: string } }).content.text.includes("22  It is of the Lord's mercies"))!;
    await selectText("his compassions fail not.", { testID: lamentations.props.testID });
    await press(within(screen.getByTestId("verse-actions")).getByTestId("action-explore"));
    const sheet = screen.getByTestId("explore-sheet");
    expect(within(sheet).getByText("Lamentations 3:22")).toBeTruthy();
    expect(within(sheet).getByTestId("explore-subject")).toHaveTextContent("his compassions fail not.");
    expect(callsTo("lexicon").map((call) => param(call, "term"))).toEqual(["his compassions fail not", "his compassions fail not"]);
    const languages = within(sheet).getByTestId("explore-section-languages");
    expect(within(languages).getByText("Lamentations 3 interlinear")).toBeTruthy();
    const opened = jest.spyOn(Blocks, "openExternal").mockResolvedValue(undefined);
    await press(within(languages).getByTestId("explore-section-languages-toggle"));
    await press(within(languages).getByTestId("explore-interlinear"));
    expect(opened).toHaveBeenLastCalledWith("https://biblehub.com/interlinear/lamentations/3.htm");
  });
});
