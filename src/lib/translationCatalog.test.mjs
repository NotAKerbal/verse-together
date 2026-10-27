import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogLanguages, comparisonQuery, filterTranslationCatalog, isLicensedOnlyQuery, languageDisplayName, searchCatalogLanguages,
  translationNativeName, translationTitle, withComparison,
} from "./translationCatalog.ts";

const catalog = [
  { id: "spa_r09", name: "Santa Biblia — Reina Valera 1909", englishName: "Reina Valera 1909", shortName: "R09", language: "spa", languageEnglishName: "Spanish", languageName: "español", numberOfBooks: 66, totalNumberOfChapters: 1189 },
  { id: "eng_old", name: "Older Bible", language: "eng", languageEnglishName: "English", numberOfBooks: 27, totalNumberOfChapters: 260 },
  { id: "BSB", name: "Berean Standard Bible", shortName: "BSB", language: "eng", languageEnglishName: "English", numberOfBooks: 66, totalNumberOfChapters: 1189 },
  { id: "eng_abs", name: "A Bible Sample", shortName: "ABS", language: "eng", languageEnglishName: "English", numberOfBooks: 1, totalNumberOfChapters: 50 },
  { id: "spa_test", name: "Español edición", language: "spa", languageEnglishName: "Spanish" },
  { id: "san_x", name: "संस्कृत", englishName: "Sanskrit Bible", language: "san", languageEnglishName: "Sanskrit", languageName: "संस्कृत" },
  { id: "other", name: "Unclassified" },
];

test("language filter starts with English and supports all languages", () => {
  assert.deepEqual(filterTranslationCatalog(catalog, "eng", "").map(t => t.id), ["BSB", "eng_abs", "eng_old"]);
  assert.equal(filterTranslationCatalog(catalog, "all", "").length, catalog.length);
  assert.deepEqual(filterTranslationCatalog(catalog, "spa", "reina 1909").map(t => t.id), ["spa_r09"]);
  assert.deepEqual(filterTranslationCatalog(catalog, "spa", "Reina Valera 1909").map(t => t.id), ["spa_r09"]);
});

test("search matches native language, accents, abbreviation and every query word", () => {
  assert.equal(filterTranslationCatalog(catalog, "all", "espanol").length, 2);
  assert.equal(filterTranslationCatalog(catalog, "eng", "bsb")[0].id, "BSB");
  assert.equal(filterTranslationCatalog(catalog, "eng", "reina").length, 0);
  assert.equal(filterTranslationCatalog(catalog, "all", "NRSVue").length, 0);
});

test("exact abbreviation ranks ahead of names that merely contain it", () => {
  const withNoise = [...catalog, { id: "eng_absx", name: "Absolutely Literal", language: "eng" }];
  assert.equal(filterTranslationCatalog(withNoise, "eng", "abs")[0].id, "eng_abs");
  const kjv = [{ id: "eng_cpb", name: "KJV Cambridge Paragraph", shortName: "KJVCP" }, { id: "eng_kjv", name: "King James Version", shortName: "KJAV" }];
  assert.equal(filterTranslationCatalog(kjv, "all", "kjv")[0].id, "eng_kjv");
});

test("all-languages browsing groups by language before title", () => {
  const ids = filterTranslationCatalog(catalog, "all", "").map(t => t.id);
  assert.ok(ids.indexOf("BSB") < ids.indexOf("san_x") && ids.indexOf("san_x") < ids.indexOf("spa_r09"));
});

test("language counts include unspecified languages without losing entries", () => {
  assert.equal(catalogLanguages(catalog).find(l => l.id === "spa").count, 2);
  assert.equal(catalogLanguages(catalog).find(l => l.id === "unknown").count, 1);
  assert.equal(catalogLanguages(catalog).find(l => l.id === "spa").nativeName, "español");
});

test("language chooser finds English names, native names and codes", () => {
  const languages = catalogLanguages(catalog);
  assert.equal(searchCatalogLanguages(languages, "")[0].id, "eng");
  assert.equal(searchCatalogLanguages(languages, "span")[0].id, "spa");
  assert.equal(searchCatalogLanguages(languages, "Español")[0].id, "spa");
  assert.equal(searchCatalogLanguages(languages, "spa")[0].id, "spa");
  assert.equal(searchCatalogLanguages(languages, "espanol")[0].id, "spa");
  assert.deepEqual(searchCatalogLanguages(languages, "zzz"), []);
  assert.equal(searchCatalogLanguages(languages, "panish").length, 1);
  // Exact and prefix matches rank ahead of names that merely contain the text.
  const ranked = searchCatalogLanguages([{ id: "xan", label: "Hispanic Creole", count: 9 }, ...languages], "span");
  assert.equal(ranked[0].id, "spa");
});

test("titles prefer English names and keep a distinct native name", () => {
  assert.equal(translationTitle(catalog[0]), "Reina Valera 1909");
  assert.equal(translationNativeName(catalog[0]), "Santa Biblia — Reina Valera 1909");
  assert.equal(translationNativeName({ id: "x", name: "Bible", englishName: "bible" }), undefined);
  // Featured rows use our own label as the title; the provider name is only shown when it adds something.
  assert.equal(translationNativeName({ id: "eng_lsv", name: "Literal Standard Version", englishName: "English LSV" }, "Literal Standard Version"), undefined);
  assert.equal(languageDisplayName({ label: "Spanish", nativeName: "español" }), "Spanish · español");
  assert.equal(languageDisplayName({ label: "English", nativeName: "English" }), "English");
});

test("licensed-only searches are recognized for a truthful note", () => {
  assert.equal(isLicensedOnlyQuery("NRSVue"), true);
  assert.equal(isLicensedOnlyQuery("esv bible"), true);
  assert.equal(isLicensedOnlyQuery("Berean"), false);
});

test("turning a comparison on or off keeps order and catalog ID case, without duplicates", () => {
  assert.deepEqual(withComparison(["BSB", "eng_net"], "spa_r09", true), ["BSB", "eng_net", "spa_r09"]);
  assert.deepEqual(withComparison(["BSB", "eng_net"], "bsb", true), ["BSB", "eng_net"]);
  assert.deepEqual(withComparison(["BSB", "eng_net"], "bsb", false), ["eng_net"]);
  assert.deepEqual(withComparison(["eng_net"], "BSB", false), ["eng_net"]);
  // Repeating the same intent (a quick double tap) changes nothing.
  const once = withComparison(["BSB"], "eng_net", true);
  assert.deepEqual(withComparison(once, "eng_net", true), once);
});

test("comparison URLs keep unrelated settings and drop empty selections", () => {
  const added = new URLSearchParams(comparisonQuery("translation=BSB&compare=eng_net&verse=16", ["BSB", "eng_net", "spa_r09"]));
  assert.equal(added.get("translation"), "BSB");
  assert.deepEqual(added.getAll("compare"), ["eng_net", "spa_r09"]);
  assert.equal(added.get("verse"), "16");
  const removed = new URLSearchParams(comparisonQuery(added.toString(), ["eng_net", "spa_r09"]));
  assert.equal(removed.get("translation"), "eng_net");
  assert.deepEqual(removed.getAll("compare"), ["spa_r09"]);
  assert.equal(comparisonQuery("translation=BSB", []), "");
  assert.equal(comparisonQuery("translation=BSB&verse=2", []), "verse=2");
});
