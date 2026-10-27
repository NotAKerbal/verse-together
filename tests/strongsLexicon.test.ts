import { describe, expect, test } from "vitest";
import { lookupStrongs } from "../src/lib/strongsLexicon.server";
import { prepareStrongsEntries, scriptRuns, searchStrongsEntries, type StrongsEntry } from "../src/lib/strongsLexicon";

const ids = (matches: { id: string }[]) => matches.map((match) => match.id);

function entry(id: string, kjv: string, definition = ""): StrongsEntry {
  return { id, lemma: "", transliteration: "", pronunciation: null, definition, derivation: "", kjv };
}

describe("Strong's entries for an English word, from the bundled OpenScriptures data", () => {
  test("finds πίστις and אֱמוּנָה for faith", async () => {
    const greek = await lookupStrongs("greek", "faith");
    expect(ids(greek.matches).slice(0, 3)).toContain("G4102");
    const pistis = greek.matches.find((match) => match.id === "G4102");
    expect(pistis).toMatchObject({ lemma: "πίστις", transliteration: "pístis", matchedIn: "kjv" });
    expect(pistis?.kjv).toContain("faith");

    const hebrew = await lookupStrongs("hebrew", "Faith");
    expect(hebrew.term).toBe("faith");
    const emunah = hebrew.matches.find((match) => match.id === "H530");
    expect(emunah).toMatchObject({ lemma: "אֱמוּנָה", pronunciation: "em-oo-naw'" });
    expect(hebrew.attribution).toMatchObject({ title: "Strong’s Hebrew Dictionary", license: expect.stringContaining("CC-BY-SA") });
    expect(hebrew.attribution.sourceUrl).toMatch(/^https:\/\/github\.com\/openscriptures\/strongs\//);
  });

  test("puts an exact King James rendering before a mention in a definition", async () => {
    const { matches } = await lookupStrongs("greek", "heart");
    expect(matches[0].id).toBe("G2588");
    const firstDefinitionOnly = matches.findIndex((match) => match.matchedIn === "definition");
    if (firstDefinitionOnly >= 0) expect(matches.slice(firstDefinitionOnly).every((match) => match.matchedIn === "definition")).toBe(true);
  });

  test("matches whole words, so art does not find heart", async () => {
    for (const language of ["hebrew", "greek"] as const) {
      const { matches } = await lookupStrongs(language, "art");
      expect(matches.length).toBeGreaterThan(0);
      for (const match of matches) {
        expect(`${match.kjv} ${match.definition}`.toLowerCase()).toMatch(/\bart\b/);
      }
      expect(ids(matches)).not.toContain(language === "greek" ? "G2588" : "H3820");
    }
  });

  test("finds the singular for a plural or possessive, and the verb for a King James form", async () => {
    expect(ids((await lookupStrongs("greek", "prophets")).matches)).toContain("G4396");
    expect(ids((await lookupStrongs("greek", "Father's")).matches)[0]).toBe("G3962");
    expect(ids((await lookupStrongs("greek", "believeth")).matches)).toContain("G4100");
  });

  test("returns no entries for an unknown word", async () => {
    const lookup = await lookupStrongs("hebrew", "xyzzy");
    expect(lookup).toMatchObject({ matches: [], total: 0 });
  });

  test("bounds the results", async () => {
    const lookup = await lookupStrongs("hebrew", "light");
    expect(lookup.total).toBeGreaterThan(8);
    expect(lookup.matches).toHaveLength(8);
  });
});

describe("reading Strong's King James renderings", () => {
  const prepared = prepareStrongsEntries([
    entry("H1", "chief, (fore-) father(-less), [idiom] patrimony, principal. Compare names in 'Abi-'."),
    entry("H2", "faith(-ful, -ly, -ness, (man)), set office, stability"),
    entry("H3", "be ashamed, clean, (make) dry (up)"),
    entry("H4", "and, also, but, then"),
    entry("H5", "heart(-ed), mind", "the heart; also used for the feelings and the will"),
    entry("H6", "feelings", "the art of the heart"),
  ]);

  test("reads optional parts, prefixes, and suffixes", () => {
    expect(ids(searchStrongsEntries(prepared, "father").matches)).toEqual(["H1"]);
    expect(ids(searchStrongsEntries(prepared, "forefather").matches)).toEqual(["H1"]);
    expect(ids(searchStrongsEntries(prepared, "faithful").matches)).toEqual(["H2"]);
    expect(ids(searchStrongsEntries(prepared, "ashamed").matches)).toEqual(["H3"]);
    expect(ids(searchStrongsEntries(prepared, "dry").matches)).toEqual(["H3"]);
    // "Compare names in 'Abi-'" is a note, not a rendering.
    expect(searchStrongsEntries(prepared, "names").matches).toEqual([]);
  });

  test("ranks a rendering above a definition and matches common words only exactly", () => {
    const heart = searchStrongsEntries(prepared, "heart");
    expect(ids(heart.matches)).toEqual(["H5", "H6"]);
    expect(heart.matches.map((match) => match.matchedIn)).toEqual(["kjv", "definition"]);
    expect(ids(searchStrongsEntries(prepared, "and").matches)).toEqual(["H4"]);
    expect(ids(searchStrongsEntries(prepared, "art").matches)).toEqual(["H6"]);
  });
});

describe("mixed-script text", () => {
  test("isolates Hebrew and Greek runs", () => {
    expect(scriptRuns("feminine of H529 (אֵמוּן);")).toEqual([
      { text: "feminine of H529 (" },
      { text: "אֵמוּן", script: "hebrew" },
      { text: ");" },
    ]);
    expect(scriptRuns("from G3982 (πείθω);")[1]).toEqual({ text: "πείθω", script: "greek" });
    expect(scriptRuns("or (shortened) אֱמֻנָה בַּת")).toEqual([{ text: "or (shortened) " }, { text: "אֱמֻנָה בַּת", script: "hebrew" }]);
    expect(scriptRuns("a primitive word")).toEqual([{ text: "a primitive word" }]);
  });
});
