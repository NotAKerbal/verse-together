// Finds Strong's Hebrew and Greek dictionary entries for an English word: entries whose King James renderings
// include the word, then entries whose definitions use it. These are candidates for the word, not the original
// word of any particular verse. The datasets (OpenScriptures' Strong's, see docs/strongs-data.md) load only on
// the server (strongsLexicon.server.ts); this module holds the shared types and the matching rules.

import { RELATED_STOPWORDS, normalizePhrase, normalizeStudyTerm, termForms } from "./studyHelps";

export type StrongsLanguage = "hebrew" | "greek";

export type StrongsEntry = {
  /** "H530", "G4102". */
  id: string;
  lemma: string;
  transliteration: string;
  pronunciation: string | null;
  definition: string;
  derivation: string;
  /** The King James renderings, in Strong's notation: "faith(-ful, -ly), set office, …". */
  kjv: string;
};

export type StrongsDataset = {
  source: string;
  revision: string;
  license: string;
  notices: string;
  entries: StrongsEntry[];
};

export type StrongsMatch = StrongsEntry & {
  /** Where the word was found: one of the King James renderings, or only the definition. */
  matchedIn: "kjv" | "definition";
};

export type StrongsLookup = {
  language: StrongsLanguage;
  term: string;
  matches: StrongsMatch[];
  /** All entries that matched, of which `matches` are the best. */
  total: number;
  attribution: { title: string; sourceUrl: string; license: string };
};

export const STRONGS_TITLES: Record<StrongsLanguage, string> = {
  hebrew: "Strong’s Hebrew Dictionary",
  greek: "Strong’s Greek Dictionary",
};

/** Hebrew (right to left) or Greek, for a lemma's `lang` attribute. */
export const STRONGS_LANG: Record<StrongsLanguage, { lang: string; dir: "rtl" | "ltr" }> = {
  hebrew: { lang: "he", dir: "rtl" },
  greek: { lang: "grc", dir: "ltr" },
};

// Leading words that make "be ashamed" or "cause to perish" a form of the rendering's main word.
const AUXILIARIES = new Set(["be", "become", "make", "cause", "to", "do", "have", "give", "that", "the", "a", "an", "is", "one"]);

type PreparedRendering = {
  /** The rendering without its optional parts: "faith", "set office", "be ashamed". */
  base: string;
  /** The base without leading auxiliaries: "ashamed". */
  core: string;
  /** Words formed from the rendering's prefixes and suffixes: "faithful", "forefather". */
  expansions: string[];
  /** Every word of the rendering, optional parts included, padded with spaces for whole-word searches. */
  padded: string;
};

type PreparedEntry = { entry: StrongsEntry; renderings: PreparedRendering[]; definition: string };

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (char === "," || char === ";")) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

function prepareRendering(raw: string): PreparedRendering | null {
  // "[idiom]", "[phrase]", "+", and "--" mark how a rendering is used, not words of it.
  const text = raw.replace(/\[[^\]]*\]/g, " ").replace(/\+|--/g, " ").toLowerCase();
  let base = text;
  while (/\([^()]*\)/.test(base)) base = base.replace(/\([^()]*\)/g, " ");
  base = normalizePhrase(base);
  if (!base) return null;
  const words = base.split(" ");
  let start = 0;
  while (start < words.length - 1 && AUXILIARIES.has(words[start])) start += 1;
  const expansions: string[] = [];
  // Only a group's own items form words: "faith(-ful, -ness, (man))" reads as "faith(-ful, -ness, )".
  let flat = text;
  while (/\([^()]*\([^()]*\)[^()]*\)/.test(flat)) flat = flat.replace(/\(([^()]*)\([^()]*\)([^()]*)\)/g, "($1$2)");
  // "faith(-ful, -ly)" and "light (-en, -ened)": suffixes.
  for (const match of flat.matchAll(/([a-z]+)\s?\(([^()]*)\)/g)) {
    for (const item of match[2].split(",")) {
      const suffix = item.trim();
      if (/^-[a-z]+$/.test(suffix)) expansions.push(match[1] + suffix.slice(1));
    }
  }
  // "(fore-) father": prefixes.
  for (const match of flat.matchAll(/\(([^()]*)\)\s?([a-z]+)/g)) {
    for (const item of match[1].split(",")) {
      const prefix = item.trim();
      if (/^[a-z]+-$/.test(prefix)) expansions.push(prefix.slice(0, -1) + match[2]);
    }
  }
  return { base, core: words.slice(start).join(" "), expansions, padded: ` ${normalizePhrase(text)} ` };
}

// The plain verb of a King James form, so "believeth" and "believed" find "believe": stem, and stem + "e".
function verbForms(term: string): string[] {
  const ending = /^(.{3,}?)(?:eth|est|ed)$/.exec(term);
  if (!ending || term.includes(" ")) return [];
  return [ending[1], `${ending[1]}e`].filter((form) => !RELATED_STOPWORDS.has(form));
}

export function prepareStrongsEntries(entries: StrongsEntry[]): PreparedEntry[] {
  return entries.map((entry) => {
    // "Compare names in 'Abi-'." and "See H1234." are notes, not renderings.
    const kjv = entry.kjv.replace(/\.\s*(?:Compare|See)\b[\s\S]*$/, "").replace(/\.\s*$/, "");
    const renderings = splitTopLevel(kjv).map(prepareRendering).filter((item): item is PreparedRendering => item != null);
    return { entry, renderings, definition: ` ${normalizePhrase(entry.definition)} ` };
  });
}

/**
 * The entries for an English word, best first: a King James rendering that is exactly the word, then one formed
 * from it ("faithful" from "faith(-ful)") or using it, then entries whose definition uses it. Words match whole,
 * so "art" never finds "heart". A common word ("and", "the") matches only renderings that are exactly it.
 */
export function searchStrongsEntries(
  prepared: PreparedEntry[],
  word: string,
  { limit = 8 }: { limit?: number } = {}
): { term: string; matches: StrongsMatch[]; total: number } {
  const term = normalizeStudyTerm(word);
  if (!term) return { term, matches: [], total: 0 };
  const forms = [...new Set([...termForms(term), ...verbForms(term)])];
  const common = RELATED_STOPWORDS.has(term);
  const found: { match: StrongsMatch; rank: number; tie: number; number: number }[] = [];

  for (const { entry, renderings, definition } of prepared) {
    let bestRank = Number.POSITIVE_INFINITY;
    let bestTie = Number.POSITIVE_INFINITY;
    const consider = (rank: number, tie: number) => {
      if (rank < bestRank || (rank === bestRank && tie < bestTie)) {
        bestRank = rank;
        bestTie = tie;
      }
    };
    forms.forEach((form, formIndex) => {
      for (const rendering of renderings) {
        // Fewer renderings: the word is more nearly what this entry means.
        if (rendering.base === form) consider(formIndex, renderings.length);
        else if (rendering.core === form || rendering.expansions.includes(form)) consider(10 + formIndex, renderings.length);
        else if (!common && rendering.padded.includes(` ${form} `)) consider(20 + formIndex, renderings.length);
      }
      if (!common) {
        const position = definition.indexOf(` ${form} `);
        // An earlier mention is closer to the definition's main sense.
        if (position >= 0) consider(30 + formIndex, position);
      }
    });
    if (Number.isFinite(bestRank)) {
      found.push({
        match: { ...entry, matchedIn: bestRank < 30 ? "kjv" : "definition" },
        rank: bestRank,
        tie: bestTie,
        number: Number(entry.id.slice(1)) || 0,
      });
    }
  }

  found.sort((a, b) => a.rank - b.rank || a.tie - b.tie || a.number - b.number);
  return { term, matches: found.slice(0, limit).map((item) => item.match), total: found.length };
}

export type ScriptRun = { text: string; script?: "hebrew" | "greek" };

const HEBREW_RUN = "[\\u0590-\\u05FF\\uFB1D-\\uFB4F]+(?:[\\s\\u05BE-]+[\\u0590-\\u05FF\\uFB1D-\\uFB4F]+)*";
const GREEK_RUN = "[\\u0370-\\u03FF\\u1F00-\\u1FFF]+(?:\\s+[\\u0370-\\u03FF\\u1F00-\\u1FFF]+)*";
const SCRIPT_RUNS = new RegExp(`(${HEBREW_RUN})|(${GREEK_RUN})`, "g");

/**
 * Text split into English and Hebrew or Greek runs, so each Hebrew word in "feminine of H529 (אֵמוּן)" can be
 * isolated and read right to left without reordering the English around it.
 */
export function scriptRuns(text: string): ScriptRun[] {
  const runs: ScriptRun[] = [];
  let last = 0;
  for (const match of text.matchAll(SCRIPT_RUNS)) {
    const start = match.index ?? 0;
    if (start > last) runs.push({ text: text.slice(last, start) });
    runs.push({ text: match[0], script: match[1] ? "hebrew" : "greek" });
    last = start + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}
