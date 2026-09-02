import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const directory = path.resolve(".batch-output/chapter-insights-v4");
const requestsPath = path.join(directory, "requests.jsonl");
const resultsPath = path.join(directory, "results.jsonl");
const outputPath = path.join(directory, "retry-requests.jsonl");
const requests = new Map(
  (await readFile(requestsPath, "utf8")).trim().split("\n").map(JSON.parse).map((row) => [row.custom_id, row])
);
const results = (await readFile(resultsPath, "utf8")).trim().split("\n").map(JSON.parse);
const retryRows = results
  .filter((row) => row.response?.status_code !== 200 || row.response?.body?.status !== "completed")
  .map((row) => {
    const request = structuredClone(requests.get(row.custom_id));
    if (!request) throw new Error(`Missing original request for ${row.custom_id}`);
    request.body.max_output_tokens = 20000;
    return request;
  });
const jsonl = `${retryRows.map((row) => JSON.stringify(row)).join("\n")}\n`;
await writeFile(outputPath, jsonl);
await writeFile(
  `${outputPath}.manifest.json`,
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    requestCount: retryRows.length,
    reason: "Original response reached max_output_tokens before completing structured JSON.",
    maxOutputTokens: 20000,
    sha256: createHash("sha256").update(jsonl).digest("hex"),
  }, null, 2)}\n`
);
console.log(JSON.stringify({ outputPath, requestCount: retryRows.length }, null, 2));
