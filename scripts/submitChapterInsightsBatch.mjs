import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [inputPathArgument, confirmation] = process.argv.slice(2);
if (!inputPathArgument || confirmation !== "--confirm-submit") {
  throw new Error(
    "Usage: npm run batch:insights:submit -- <requests.jsonl> --confirm-submit"
  );
}

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

const inputPath = path.resolve(inputPathArgument);
const fileContents = await readFile(inputPath);
const uploadBody = new FormData();
uploadBody.set("purpose", "batch");
uploadBody.set("file", new Blob([fileContents], { type: "application/jsonl" }), path.basename(inputPath));

const uploadResponse = await fetch("https://api.openai.com/v1/files", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}` },
  body: uploadBody,
});
const uploadedFile = await uploadResponse.json();
if (!uploadResponse.ok) {
  throw new Error(`OpenAI file upload failed (${uploadResponse.status}): ${uploadedFile.error?.message ?? "unknown error"}`);
}

const batchResponse = await fetch("https://api.openai.com/v1/batches", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    input_file_id: uploadedFile.id,
    endpoint: "/v1/responses",
    completion_window: "24h",
    metadata: { purpose: "verse-together-chapter-insights" },
  }),
});
const batch = await batchResponse.json();
if (!batchResponse.ok) {
  throw new Error(`OpenAI batch creation failed (${batchResponse.status}): ${batch.error?.message ?? "unknown error"}`);
}

const receiptPath = `${inputPath}.submitted.json`;
await writeFile(
  receiptPath,
  `${JSON.stringify(
    {
      submittedAt: new Date().toISOString(),
      inputPath,
      inputFileId: uploadedFile.id,
      batchId: batch.id,
      status: batch.status,
      endpoint: batch.endpoint,
    },
    null,
    2
  )}\n`
);
console.log(JSON.stringify({ batchId: batch.id, status: batch.status, receiptPath }, null, 2));
