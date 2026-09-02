import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildChapterInsightResponseBody,
  CHAPTER_INSIGHT_MODEL,
} from "../src/lib/chapterInsightRequest.ts";
import { CHAPTER_INSIGHT_PROMPT_VERSION } from "../src/lib/chapterInsights.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutputDirectory = path.join(
  repoRoot,
  ".batch-output",
  `chapter-insights-v${CHAPTER_INSIGHT_PROMPT_VERSION}`
);
const maximumBatchBytes = 200 * 1024 * 1024;

function readArguments(argv) {
  const options = {
    outputDirectory: defaultOutputDirectory,
    skippedRefs: new Set(),
    canaryRef: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--out-dir" && value) {
      options.outputDirectory = path.resolve(repoRoot, value);
      index += 1;
    } else if (argument === "--skip-ref" && value) {
      options.skippedRefs.add(value.toLowerCase());
      index += 1;
    } else if (argument === "--canary-ref" && value) {
      options.canaryRef = value.toLowerCase();
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  return options;
}

function chapterKey(volume, book, chapter) {
  return `${volume}:${book}:${chapter}`;
}

function customId(volume, book, chapter) {
  return `ci${CHAPTER_INSIGHT_PROMPT_VERSION}:${volume}:${book}:${chapter}`;
}

function batchLine(chapter) {
  return {
    custom_id: customId(chapter.volume, chapter.book, chapter.chapter),
    method: "POST",
    url: "/v1/responses",
    body: buildChapterInsightResponseBody(chapter.reference, chapter.verses),
  };
}

async function loadChapters() {
  const manifestPath = path.join(repoRoot, "public", "scripture-data", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const chapters = [];

  for (const volumeSummary of manifest.volumes) {
    const bundlePath = path.join(repoRoot, "public", volumeSummary.bundlePath.replace(/^\//, ""));
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    for (const book of bundle.books) {
      for (const chapter of book.chapters) {
        chapters.push({
          volume: bundle.volume.volume,
          book: book.book,
          chapter: chapter.chapter,
          reference: `${book.title} ${chapter.chapter}`,
          verses: chapter.verses,
        });
      }
    }
  }

  if (chapters.length !== manifest.chapterCount) {
    throw new Error(`Expected ${manifest.chapterCount} chapters, found ${chapters.length}.`);
  }
  return { chapters, scriptureVersion: manifest.version };
}

const options = readArguments(process.argv.slice(2));
const { chapters, scriptureVersion } = await loadChapters();
const skipped = chapters.filter((chapter) =>
  options.skippedRefs.has(chapterKey(chapter.volume, chapter.book, chapter.chapter))
);
if (skipped.length !== options.skippedRefs.size) {
  const found = new Set(skipped.map((chapter) => chapterKey(chapter.volume, chapter.book, chapter.chapter)));
  const missing = [...options.skippedRefs].filter((key) => !found.has(key));
  throw new Error(`Skipped chapter reference not found: ${missing.join(", ")}`);
}

const requested = chapters.filter(
  (chapter) => !options.skippedRefs.has(chapterKey(chapter.volume, chapter.book, chapter.chapter))
);
const lines = requested.map(batchLine);
const jsonl = `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
const bytes = Buffer.byteLength(jsonl);
if (bytes > maximumBatchBytes) {
  throw new Error(`Batch is ${(bytes / 1024 / 1024).toFixed(1)} MB; OpenAI's limit is 200 MB.`);
}

const canaryKey = options.canaryRef ?? chapterKey(requested[0].volume, requested[0].book, requested[0].chapter);
const canaryChapter = requested.find(
  (chapter) => chapterKey(chapter.volume, chapter.book, chapter.chapter) === canaryKey
);
if (!canaryChapter) throw new Error(`Canary chapter reference not found in request set: ${canaryKey}`);
const canaryJsonl = `${JSON.stringify(batchLine(canaryChapter))}\n`;
const countsByVolume = Object.fromEntries(
  [...new Set(chapters.map((chapter) => chapter.volume))].map((volume) => [
    volume,
    requested.filter((chapter) => chapter.volume === volume).length,
  ])
);
const generatedAt = new Date().toISOString();
const manifest = {
  generatedAt,
  endpoint: "/v1/responses",
  completionWindow: "24h",
  model: CHAPTER_INSIGHT_MODEL,
  promptVersion: CHAPTER_INSIGHT_PROMPT_VERSION,
  scriptureVersion,
  totalStandardWorksChapters: chapters.length,
  requestCount: requested.length,
  countsByVolume,
  skipped: skipped.map((chapter) => ({
    key: chapterKey(chapter.volume, chapter.book, chapter.chapter),
    reference: chapter.reference,
  })),
  canary: {
    key: canaryKey,
    customId: customId(canaryChapter.volume, canaryChapter.book, canaryChapter.chapter),
  },
  requestFile: "requests.jsonl",
  requestBytes: bytes,
  requestSha256: createHash("sha256").update(jsonl).digest("hex"),
};

await mkdir(options.outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(options.outputDirectory, "requests.jsonl"), jsonl),
  writeFile(path.join(options.outputDirectory, "canary.jsonl"), canaryJsonl),
  writeFile(path.join(options.outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
]);

console.log(JSON.stringify({ outputDirectory: options.outputDirectory, ...manifest }, null, 2));
