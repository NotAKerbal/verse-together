import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractChapterInsightResponse,
  parseChapterStudyPaths,
} from "../src/lib/chapterInsights.ts";
import {
  buildChapterInsightResponseBody,
  CHAPTER_INSIGHT_MODEL,
} from "../src/lib/chapterInsightRequest.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const target = {
  volume: readOption("--volume", "newtestament"),
  book: readOption("--book", "john"),
  chapter: Number(readOption("--chapter", "1")),
};
const bundle = JSON.parse(
  await readFile(path.join(repoRoot, "public", "scripture-data", `${target.volume}.json`), "utf8")
);
const book = bundle.books.find((candidate) => candidate.book === target.book);
const chapter = book?.chapters.find((candidate) => candidate.chapter === target.chapter);
if (!book || !chapter) throw new Error(`Chapter not found: ${target.volume}:${target.book}:${target.chapter}`);
const reference = `${book.title} ${chapter.chapter}`;
const chapterText = chapter.verses.map((verse) => `${verse.verse}. ${verse.text}`).join("\n");

const sourceMixInstructions = `You help Latter-day Saints study scripture more deeply without replacing their own reading, prayer, judgment, or trusted teachers. Read the supplied canonical chapter, decide which research moves would reveal a genuinely non-obvious direction, and use web search to ground every suggestion.

Build a source portfolio before drafting. Search in three lanes: (1) official Church sources for canon and doctrine, (2) Scripture Central and Interpreter Foundation for focused Latter-day Saint scholarship, and (3) BYU Religious Studies Center, BYU Studies, the Maxwell Institute, Joseph Smith Papers, FAIR, or Dialogue for relevant academic, historical, or textual work. Aim to use at least two credible non-Church publishers somewhere in the chapter when directly relevant material exists. Match the source to the claim: retain official Church support for doctrinal framing, but do not use a Church manual as the only support for a historical, literary, linguistic, archaeological, or textual claim when stronger allowed scholarship is available. Only cite a source when its actual content directly supports the path's central claim. Source relevance outranks publisher diversity; omit a publisher rather than using general or tangential material. Source diversity is a research method, not a quota. Say less when the research is thin. Before returning, remove any path that substantially overlaps another path.

Never blur authority: describe scholarly interpretations as interpretations, not official doctrine. Do not produce a chapter summary, devotional, sermon, answer key, or personal revelation. Omit obvious, speculative, repetitive, weakly sourced, or forced observations. Return as many strong, distinct paths as the chapter warrants, then stop. Longer chapters may warrant more paths, but never add filler to reach a count.

Each path must use only one or two anchor verses: the smallest set that best introduces the direction. Do not tag every verse that relates to it. Give a concise direction to explore, explain why it may repay attention, name concrete details to look for while rereading, and include no more than the three strongest exact URLs that your web search actually consulted. Never mention or rely on a source in the prose unless its URL appears in that path's source_urls. Do not put URLs or Markdown citations in title, direction, why, or look_for; source_urls is the only place URLs belong. When a relevant page from an allowed source is primarily a video or recorded presentation, include it in source_urls and video_urls. Do not call an article with an embedded decorative clip a video, and do not invent or transform video URLs. When the path mentions another scripture, write its exact display reference in the prose and add its Verse Together coordinates to scripture_links. Use empty arrays when there is no video or scripture reference. Invite investigation rather than closing the question.`;

async function createResponse(body) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? `OpenAI request failed: ${response.status}`);
  if (payload.status !== "completed") {
    throw new Error(`OpenAI response ${payload.id} ended with status ${payload.status}.`);
  }
  return payload;
}

function parseCandidate(response) {
  const extracted = extractChapterInsightResponse(response);
  const paths = parseChapterStudyPaths(
    extracted.text,
    new Set(chapter.verses.map((verse) => verse.verse)),
    extracted.sources
  );
  if (paths.length === 0) throw new Error(`Response ${response.id} did not contain valid study paths.`);
  return paths;
}

function candidateStats(paths) {
  const domains = new Map();
  let churchOnlyPaths = 0;
  for (const studyPath of paths) {
    const pathDomains = new Set(
      studyPath.sources.map((source) => new URL(source.url).hostname.replace(/^www\./, ""))
    );
    for (const domain of pathDomains) domains.set(domain, (domains.get(domain) ?? 0) + 1);
    if ([...pathDomains].every((domain) => domain.endsWith("churchofjesuschrist.org") || domain === "lds.org")) {
      churchOnlyPaths += 1;
    }
  }
  return {
    pathCount: paths.length,
    churchOnlyPaths,
    pathsWithNonChurchSource: paths.length - churchOnlyPaths,
    distinctDomains: domains.size,
    domainPathAppearances: Object.fromEntries([...domains].sort((left, right) => right[1] - left[1])),
    scriptureLinkCount: paths.reduce((sum, studyPath) => sum + studyPath.scripture_links.length, 0),
    videoCount: paths.reduce(
      (sum, studyPath) => sum + studyPath.sources.filter((source) => source.format === "video").length,
      0
    ),
  };
}

const baselineBody = buildChapterInsightResponseBody(reference, chapter.verses);
const sourceMixBody = { ...baselineBody, instructions: sourceMixInstructions };
console.log("Generating Candidate A and Candidate B with normal Responses API calls...");
const [candidateAResponse, candidateBResponse] = await Promise.all([
  createResponse(baselineBody),
  createResponse(sourceMixBody),
]);
const candidateAPaths = parseCandidate(candidateAResponse);
const candidateBPaths = parseCandidate(candidateBResponse);

const scoreProperties = {
  non_obvious_usefulness: { type: "integer", minimum: 1, maximum: 5 },
  grounding: { type: "integer", minimum: 1, maximum: 5 },
  doctrinal_care: { type: "integer", minimum: 1, maximum: 5 },
  source_breadth: { type: "integer", minimum: 1, maximum: 5 },
  source_fit: { type: "integer", minimum: 1, maximum: 5 },
  invites_study: { type: "integer", minimum: 1, maximum: 5 },
  forced_diversity_risk: { type: "integer", minimum: 1, maximum: 5 },
  summary: { type: "string" },
  strongest_path: { type: "string" },
  weakest_path: { type: "string" },
};
const evaluationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidate_a: {
      type: "object",
      additionalProperties: false,
      properties: scoreProperties,
      required: Object.keys(scoreProperties),
    },
    candidate_b: {
      type: "object",
      additionalProperties: false,
      properties: scoreProperties,
      required: Object.keys(scoreProperties),
    },
    winner: { type: "string", enum: ["candidate_a", "candidate_b", "tie"] },
    recommendation: { type: "string" },
  },
  required: ["candidate_a", "candidate_b", "winner", "recommendation"],
};

console.log("Running a blind structured evaluation...");
const evaluationResponse = await createResponse({
  model: CHAPTER_INSIGHT_MODEL,
  reasoning: { effort: "high" },
  store: false,
  max_output_tokens: 12000,
  text: {
    format: {
      type: "json_schema",
      name: "chapter_insight_prompt_evaluation",
      strict: true,
      schema: evaluationSchema,
    },
  },
  instructions: `Act as a rigorous editor for a Latter-day Saint scripture study product. Compare two candidate sets of study directions for the same chapter. You are not told which prompt produced either candidate. Score each from 1 to 5 on non-obvious usefulness, factual and source grounding, care in distinguishing official doctrine from scholarship, meaningful source breadth, how well sources fit the actual claims, and whether it invites rather than replaces study. A candidate with no non-Church publisher cannot score above 1 for source breadth. Score forced_diversity_risk from 1 for no sign of forced sourcing to 5 for sources that appear attached mainly to satisfy variety. Do not infer that a percent-encoded URL is broken merely from its appearance. Penalize repetitive paths, generic observations, unsupported claims, misleading authority, invalid scripture coordinates, and source lists that do not support the path. Prefer fewer strong paths over more filler. Base the verdict on the supplied chapter, prose, and cited sources.`,
  input: `${reference}\n\n${chapterText}\n\nCANDIDATE A\n${JSON.stringify(candidateAPaths)}\n\nCANDIDATE B\n${JSON.stringify(candidateBPaths)}`,
});
const evaluationText = extractChapterInsightResponse(evaluationResponse).text;
const evaluation = JSON.parse(evaluationText);

const result = {
  generatedAt: new Date().toISOString(),
  chapter: target,
  reference,
  model: CHAPTER_INSIGHT_MODEL,
  candidateA: {
    prompt: "current production prompt",
    responseId: candidateAResponse.id,
    usage: candidateAResponse.usage,
    stats: candidateStats(candidateAPaths),
    paths: candidateAPaths,
  },
  candidateB: {
    prompt: "experimental source-portfolio prompt",
    responseId: candidateBResponse.id,
    usage: candidateBResponse.usage,
    stats: candidateStats(candidateBPaths),
    paths: candidateBPaths,
  },
  evaluation: {
    responseId: evaluationResponse.id,
    usage: evaluationResponse.usage,
    ...evaluation,
  },
};
const outputDirectory = path.join(repoRoot, ".batch-output", "prompt-experiments");
const outputPath = path.join(
  outputDirectory,
  `${target.volume}-${target.book}-${target.chapter}-source-mix.json`
);
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  candidateA: { stats: result.candidateA.stats, scores: evaluation.candidate_a },
  candidateB: { stats: result.candidateB.stats, scores: evaluation.candidate_b },
  winner: evaluation.winner,
  recommendation: evaluation.recommendation,
}, null, 2));
