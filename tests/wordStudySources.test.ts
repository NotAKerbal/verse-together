import { describe, expect, test } from "vitest";
import studyHelpsIndexJson from "../src/lib/generated/studyHelpsIndex.json";
import {
  findStudyHelpMatches,
  slugifyStudyHelpTitle,
  studyHelpBrowseUrl,
  studyHelpEntryUrl,
  type StudyHelpIndexEntry,
  type StudyHelpsIndex,
} from "../src/lib/studyHelps";
import { bibleHubLexiconSearchUrl, getBibleInterlinearLink } from "../src/lib/wordStudySources";

const index = studyHelpsIndexJson as unknown as StudyHelpsIndex;
const titles = (entries: { title: string }[]) => entries.map((entry) => entry.title);

describe("study helps topic index", () => {
  test("holds every published topic list, without the introductions", () => {
    expect(index.guides.bd.entries.length).toBeGreaterThan(1000);
    expect(index.guides.gs.entries.length).toBeGreaterThan(900);
    expect(index.guides.tg.entries.length).toBeGreaterThan(3000);
    for (const guide of ["bd", "gs", "tg"] as const) {
      expect(index.guides[guide].tocUrl).toBe(studyHelpBrowseUrl(guide));
      expect(index.guides[guide].entries).not.toContain("Introduction");
    }
  });

  test("keeps the published slug wherever it differs from the title", () => {
    // The Topical Guide has two distinct topics titled "lord" and "Lord".
    const tgLord = findStudyHelpMatches(index.guides.tg.entries, "lord").entries;
    expect(tgLord).toEqual(expect.arrayContaining([
      { title: "lord", slug: "lord-1" },
      { title: "Lord", slug: "lord-2" },
    ]));
    expect(findStudyHelpMatches(index.guides.gs.entries, "mormon").entries[0]).toEqual({ title: "Mormon(s)", slug: "mormons" });
  });

  test("derives the published slug from plain titles", () => {
    expect(slugifyStudyHelpTitle("Aaron, Brother of Moses")).toBe("aaron-brother-of-moses");
    expect(slugifyStudyHelpTitle("Potter’s Field")).toBe("potters-field");
    expect(studyHelpEntryUrl("bd", "faith")).toBe("https://www.churchofjesuschrist.org/study/scriptures/bd/faith?lang=eng");
  });
});

describe("matching a selected word to study helps", () => {
  test("finds the entry titled with the word in each guide", () => {
    for (const guide of ["bd", "gs", "tg"] as const) {
      expect(findStudyHelpMatches(index.guides[guide].entries, "Faith").entries[0]).toEqual({ title: "Faith", slug: "faith" });
    }
  });

  test("finds a word listed among a topic's forms", () => {
    expect(titles(findStudyHelpMatches(index.guides.tg.entries, "abstinence").entries)).toEqual(["Abstain, Abstinence"]);
    const born = findStudyHelpMatches(index.guides.tg.entries, "born");
    expect(titles(born.entries)).toEqual(["Born", "Bear, Bare, Born, Borne [verb]"]);
    expect(born.entries[1].slug).toBe("bear-verb");
  });

  test("treats a qualified topic headed by the word as an entry, other mentions as related", () => {
    const aaron = findStudyHelpMatches(index.guides.gs.entries, "aaron");
    expect(titles(aaron.entries)).toEqual(["Aaron, Brother of Moses", "Aaron, Son of Mosiah"]);
    const born = findStudyHelpMatches(index.guides.tg.entries, "born");
    expect(titles(born.related)).toEqual(["Born Again", "Born of God"]);
  });

  test("does not list a word given only as a qualifier as one of the topic's forms", () => {
    // "Calves, golden, worship of" is one topic, not a list of words.
    const golden = findStudyHelpMatches(index.guides.bd.entries, "golden");
    expect(titles(golden.entries)).not.toContain("Calves, golden, worship of");
    expect(titles(golden.related)).toContain("Calves, golden, worship of");
  });

  test("matches plurals, possessives, and hyphenated names to their topics", () => {
    expect(titles(findStudyHelpMatches(index.guides.bd.entries, "prophets").entries)).toContain("Prophet");
    expect(titles(findStudyHelpMatches(index.guides.tg.entries, "mercies").entries)).toContain("Mercy, Merciful");
    expect(titles(findStudyHelpMatches(index.guides.bd.entries, "lord's").entries)).toEqual(["Lord"]);
    expect(titles(findStudyHelpMatches(index.guides.bd.entries, "beth-shan").entries)).toEqual(["Beth-shan or Beth-shean"]);
  });

  test("returns nothing for an unknown word, and no related topics for common words", () => {
    for (const guide of ["bd", "gs", "tg"] as const) {
      expect(findStudyHelpMatches(index.guides[guide].entries, "xyzzy")).toEqual({ entries: [], related: [] });
      expect(findStudyHelpMatches(index.guides[guide].entries, "of").related).toEqual([]);
    }
    expect(findStudyHelpMatches(index.guides.bd.entries, "  ")).toEqual({ entries: [], related: [] });
  });

  test("caps entries and related topics, starting with topics that begin with the word", () => {
    const jesus = findStudyHelpMatches(index.guides.tg.entries, "jesus");
    expect(jesus.related).toHaveLength(4);
    expect(jesus.related[0].title).toBe("Jesus Christ");
    const capped = findStudyHelpMatches(index.guides.tg.entries, "prophets", { maxEntries: 1, maxRelated: 0 });
    expect(capped.entries).toHaveLength(1);
    expect(capped.related).toHaveLength(0);
  });

  test("ranks a whole-title match above a headword or listed form", () => {
    const entries: StudyHelpIndexEntry[] = ["Ship, shipping", ["Shipping", "shipping-x"], "Shipping, Lanes of"];
    expect(titles(findStudyHelpMatches(entries, "shipping").entries)).toEqual(["Shipping", "Shipping, Lanes of", "Ship, shipping"]);
  });
});

describe("Biblical language links", () => {
  test("encodes the English word in Bible Hub lexicon searches", () => {
    expect(bibleHubLexiconSearchUrl("hebrew", "faith")).toBe("https://biblehub.net/searchhebrew.php?q=faith");
    expect(bibleHubLexiconSearchUrl("greek", " lord's & God ")).toBe("https://biblehub.net/searchgreek.php?q=lord's%20%26%20God");
  });

  test("links a real Bible chapter to its interlinear", () => {
    expect(getBibleInterlinearLink({ volume: "oldtestament", book: "genesis", chapter: 1 })).toEqual({
      url: "https://biblehub.com/interlinear/genesis/1.htm",
      passage: "Genesis 1",
      testament: "old",
    });
    expect(getBibleInterlinearLink({ volume: "newtestament", book: "matthew", chapter: 5 })?.url).toBe("https://biblehub.com/interlinear/matthew/5.htm");
    expect(getBibleInterlinearLink({ volume: "old-testament", book: "1samuel", chapter: 3 })?.url).toBe("https://biblehub.com/interlinear/1_samuel/3.htm");
    expect(getBibleInterlinearLink({ volume: "oldtestament", book: "songofsolomon", chapter: 8 })).toMatchObject({
      url: "https://biblehub.com/interlinear/songs/8.htm",
      passage: "Song of Solomon 8",
    });
    expect(getBibleInterlinearLink({ volume: "oldtestament", book: "psalms", chapter: 150 })?.url).toBe("https://biblehub.com/interlinear/psalms/150.htm");
    expect(getBibleInterlinearLink({ volume: "newtestament", book: "3john", chapter: 1 })).toMatchObject({
      url: "https://biblehub.com/interlinear/3_john/1.htm",
      passage: "3 John 1",
      testament: "new",
    });
  });

  test("offers no interlinear outside a real Bible chapter", () => {
    expect(getBibleInterlinearLink(null)).toBeNull();
    expect(getBibleInterlinearLink({ volume: "bookofmormon", book: "1nephi", chapter: 1 })).toBeNull();
    expect(getBibleInterlinearLink({ volume: "dnc", book: "dc", chapter: 4 })).toBeNull();
    expect(getBibleInterlinearLink({ volume: "pearl", book: "moses", chapter: 1 })).toBeNull();
    // Book of the other testament, unknown book, and chapters out of range.
    expect(getBibleInterlinearLink({ volume: "oldtestament", book: "matthew", chapter: 5 })).toBeNull();
    expect(getBibleInterlinearLink({ volume: "oldtestament", book: "genesisx", chapter: 1 })).toBeNull();
    expect(getBibleInterlinearLink({ volume: "oldtestament", book: "genesis", chapter: 0 })).toBeNull();
    expect(getBibleInterlinearLink({ volume: "oldtestament", book: "genesis", chapter: 51 })).toBeNull();
    expect(getBibleInterlinearLink({ volume: "oldtestament", book: "genesis", chapter: 1.5 })).toBeNull();
  });
});
