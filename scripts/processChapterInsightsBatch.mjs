import { createHash, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHAPTER_INSIGHT_PROMPT_VERSION,
  extractChapterInsightResponse,
  parseChapterStudyPaths,
  stableJsonStringify,
} from "../src/lib/chapterInsights.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argumentsList = process.argv.slice(2);
const resultsArgument = argumentsList.find((argument) => argument.endsWith(".jsonl"));
const shouldWrite = argumentsList.includes("--write");
const shouldWriteToProduction = argumentsList.includes("--prod");
if (!resultsArgument) {
  throw new Error("Usage: npm run batch:insights:process -- <results.jsonl> [--write] [--prod]");
}
if (shouldWriteToProduction && !shouldWrite) {
  throw new Error("--prod requires --write.");
}
const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

function chapterText(chapter) {
  return chapter.verses.map((verse) => `${verse.verse}. ${verse.text}`).join("\n");
}

const chapters = new Map();
for (const volume of ["oldtestament", "newtestament", "bookofmormon", "doctrineandcovenants", "pearl"]) {
  const bundle = JSON.parse(
    await readFile(path.join(repoRoot, "public", "scripture-data", `${volume}.json`), "utf8")
  );
  for (const book of bundle.books) {
    for (const chapter of book.chapters) {
      chapters.set(`${bundle.volume.volume}:${book.book}:${chapter.chapter}`, {
        ...chapter,
        volume: bundle.volume.volume,
        book: book.book,
        reference: `${book.title} ${chapter.chapter}`,
      });
    }
  }
}

const resultsPath = path.resolve(repoRoot, resultsArgument);
const rows = (await readFile(resultsPath, "utf8")).trim().split("\n").map(JSON.parse);
const entries = [];
const retryKeys = [];
let studyPathCount = 0;

for (const row of rows) {
  const key = typeof row.custom_id === "string"
    ? row.custom_id.replace(new RegExp(`^ci${CHAPTER_INSIGHT_PROMPT_VERSION}:`), "")
    : "";
  const chapter = chapters.get(key);
  if (!chapter) throw new Error(`Unknown chapter result: ${row.custom_id}`);
  if (row.response?.status_code !== 200 || row.response?.body?.status !== "completed") {
    retryKeys.push(key);
    continue;
  }

  const extracted = extractChapterInsightResponse(row.response.body);
  const parsedPaths = parseChapterStudyPaths(
    extracted.text,
    new Set(chapter.verses.map((verse) => verse.verse)),
    extracted.sources
  );
  const paths = parsedPaths.map((studyPath) => ({
    ...studyPath,
    scripture_links: studyPath.scripture_links.filter((link) => {
      const linked = chapters.get(`${link.volume}:${link.book}:${link.chapter}`);
      const lastVerse = linked?.verses.at(-1)?.verse ?? 0;
      return Boolean(linked && link.verse_start <= lastVerse && link.verse_end <= lastVerse);
    }),
  }));
  if (paths.length === 0) {
    retryKeys.push(key);
    continue;
  }

  const text = chapterText(chapter);
  const unsigned = {
    reference: chapter.reference,
    scriptureHash: createHash("sha256").update(text).digest("hex"),
    promptVersion: CHAPTER_INSIGHT_PROMPT_VERSION,
    paths,
    generatedAt: (row.response.body.completed_at ?? row.response.body.created_at) * 1000,
  };
  entries.push({
    volume: chapter.volume,
    book: chapter.book,
    chapter: chapter.chapter,
    ...unsigned,
    signature: createHmac("sha256", apiKey).update(stableJsonStringify(unsigned)).digest("hex"),
  });
  studyPathCount += paths.length;
}

const report = {
  resultsPath,
  resultCount: rows.length,
  validChapterCount: entries.length,
  studyPathCount,
  retryCount: retryKeys.length,
  retryKeys,
  wroteToConvex: shouldWrite,
  convexTarget: shouldWrite ? (shouldWriteToProduction ? "production" : "development") : null,
};
await writeFile(`${resultsPath}.validation.json`, `${JSON.stringify(report, null, 2)}\n`);

if (shouldWrite) {
  const chunkSize = 10;
  for (let index = 0; index < entries.length; index += chunkSize) {
    const chunk = entries.slice(index, index + chunkSize);
    const command = spawnSync(
      "npx",
      [
        "convex",
        "run",
        "chapterInsights:upsertChapterInsightBatch",
        JSON.stringify({ entries: chunk }),
        "--identity",
        JSON.stringify({ subject: "chapter-insights-batch-import", issuer: "verse-together" }),
        "--typecheck",
        "disable",
        "--codegen",
        "disable",
        ...(shouldWriteToProduction ? ["--prod"] : []),
      ],
      { cwd: repoRoot, encoding: "utf8" }
    );
    if (command.status !== 0) {
      throw new Error(command.stderr || command.stdout || `Convex import failed at row ${index}.`);
    }
    process.stdout.write(`Imported ${Math.min(index + chunk.length, entries.length)}/${entries.length}\r`);
  }
  process.stdout.write("\n");
}

console.log(JSON.stringify({ ...report, retryKeys: undefined }, null, 2));
