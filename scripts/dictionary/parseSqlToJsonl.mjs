import fs from "node:fs";
import path from "node:path";
import { formatDictionaryEntryRichText } from "./formatDictionaryEntry.mjs";
import { normalizeLookupKey } from "./normalizeLookupKey.mjs";
import { parseSqlFileInserts } from "./sqlParser.mjs";

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function mustNumber(value) {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value)) return undefined;
  return value;
}

function compactEntry(entry) {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function toEntry1828(row) {
  const word = String(row.word || row._word || row.heading || "").trim();
  const lookupKey = normalizeLookupKey(row._word || word);
  const entryText = formatDictionaryEntryRichText(String(row.content || row.string || "").trim());
  if (!lookupKey || !entryText) return null;
  return compactEntry({
    edition: "1828",
    word: word || lookupKey,
    lookupKey,
    heading: row.heading ? String(row.heading).trim() : undefined,
    entryText,
    sourceTable: "dictionary_webster1828",
    sourceId: mustNumber(row.id),
    length: mustNumber(row.length),
  });
}

function toEntry1844(row) {
  const word = String(row._word || "").trim();
  const lookupKey = normalizeLookupKey(word);
  const entryText = formatDictionaryEntryRichText(String(row.definition || "").trim());
  if (!lookupKey || !entryText) return null;
  return compactEntry({
    edition: "1844",
    word,
    lookupKey,
    entryText,
    pronounce: row.pronounce ? String(row.pronounce).trim() : undefined,
    sourceTable: "dictionary_webster1844",
    sourceId: mustNumber(row.dictionary_webster1844_id),
  });
}

function parseArgs() {
  const sourceRoot = path.resolve(argValue("--source-root", "data/dictionary/sql"));
  const outputDir = path.resolve(argValue("--output-dir", "data/dictionary/normalized"));
  const edition = argValue("--edition", "all");
  return { sourceRoot, outputDir, edition };
}

function createWriter(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return fs.createWriteStream(filePath, { encoding: "utf8" });
}

async function emitEditionRows({ filePath, mapper, writer }) {
  let count = 0;
  await parseSqlFileInserts(filePath, async ({ row }) => {
    const entry = mapper(row);
    if (!entry) return;
    writer.write(`${JSON.stringify(entry)}\n`);
    count += 1;
  });
  return count;
}

async function build1913WordsMap(wordsPath) {
  const words = new Map();
  await parseSqlFileInserts(wordsPath, async ({ row }) => {
    const wordId = mustNumber(row.word_id);
    if (!wordId) return;
    words.set(wordId, {
      word: String(row.word || "").trim(),
      lookupWord: String(row._word || row.word || "").trim(),
      pronounce: String(row.pronounce || "").trim(),
      pos: String(row.pos || "").trim(),
    });
  });
  return words;
}

async function build1913AltMap(altPath) {
  if (!fs.existsSync(altPath)) return new Map();
  const aliases = new Map();
  await parseSqlFileInserts(altPath, async ({ row }) => {
    const wordId = mustNumber(row.word_id);
    if (!wordId) return;
    const altWord = String(row._word || row.word || "").trim();
    const lookupKey = normalizeLookupKey(altWord);
    if (!lookupKey) return;
    const set = aliases.get(wordId) ?? new Set();
    set.add(lookupKey);
    aliases.set(wordId, set);
  });
  return aliases;
}

async function emit1913Rows({ definitionsPath, wordsMap, altMap, writer }) {
  let count = 0;
  await parseSqlFileInserts(definitionsPath, async ({ row }) => {
    const wordId = mustNumber(row.word_id);
    if (!wordId) return;
    const wordMeta = wordsMap.get(wordId);
    if (!wordMeta) return;

    const definition = String(row.definition || "").trim();
    const extra = String(row.extra || "").trim();
    const entryText = formatDictionaryEntryRichText([definition, extra].filter(Boolean).join("\n\n"));
    if (!entryText) return;

    const primaryLookup = normalizeLookupKey(wordMeta.lookupWord);
    if (!primaryLookup) return;

    const aliasKeys = Array.from(altMap.get(wordId) ?? []);
    const lookupKeys = [primaryLookup, ...aliasKeys].filter(Boolean);

    for (const lookupKey of lookupKeys) {
      const entry = compactEntry({
        edition: "1913",
        word: wordMeta.word || lookupKey,
        lookupKey,
        heading: wordMeta.pos || undefined,
        entryText,
        pronounce: wordMeta.pronounce || undefined,
        sourceTable: "dictionary_webster1913_definitions",
        sourceId: mustNumber(row.definition_id),
      });
      writer.write(`${JSON.stringify(entry)}\n`);
      count += 1;
    }
  });
  return count;
}

async function main() {
  const { sourceRoot, outputDir, edition } = parseArgs();

  const countByEdition = { "1828": 0, "1844": 0, "1913": 0 };
  const include1828 = edition === "all" || edition === "1828";
  const include1844 = edition === "all" || edition === "1844";
  const include1913 = edition === "all" || edition === "1913";

  const outFile = path.join(outputDir, `dictionary-${edition}.jsonl`);
  const writer = createWriter(outFile);

  if (include1828) {
    const filePath = path.join(sourceRoot, "dictionary_webster1828.sql");
    countByEdition["1828"] = await emitEditionRows({ filePath, mapper: toEntry1828, writer });
  }
  if (include1844) {
    const filePath = path.join(sourceRoot, "dictionary_webster1844.sql");
    countByEdition["1844"] = await emitEditionRows({ filePath, mapper: toEntry1844, writer });
  }
  if (include1913) {
    const wordsPath = path.join(sourceRoot, "dictionary_webster1913_words.sql");
    const definitionsPath = path.join(sourceRoot, "dictionary_webster1913_definitions.sql");
    const altPath = path.join(sourceRoot, "dictionary_webster1913_alt.sql");

    const wordsMap = await build1913WordsMap(wordsPath);
    const altMap = await build1913AltMap(altPath);
    countByEdition["1913"] = await emit1913Rows({ definitionsPath, wordsMap, altMap, writer });
  }

  writer.end();
  console.log(`Wrote ${outFile}`);
  console.table(countByEdition);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
