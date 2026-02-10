import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { ConvexHttpClient } from "convex/browser";

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function parseNumberArg(name, fallback) {
  const value = Number(argValue(name, String(fallback)));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getInputFiles(inputPath) {
  const resolved = path.resolve(inputPath);
  const stat = fs.statSync(resolved);
  if (stat.isFile()) return [resolved];
  const files = fs
    .readdirSync(resolved)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .map((name) => path.join(resolved, name));
  if (files.length === 0) throw new Error(`No .jsonl files found in ${resolved}`);
  return files;
}

async function importFile(client, filePath, batchSize) {
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let batch = [];
  let imported = 0;

  async function flush() {
    if (batch.length === 0) return;
    await client.mutation("dictionary:upsertEntriesBatch", { entries: batch });
    imported += batch.length;
    batch = [];
    if (imported % (batchSize * 10) === 0) {
      console.log(`${path.basename(filePath)} imported ${imported} rows`);
    }
  }

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    batch.push(JSON.parse(trimmed));
    if (batch.length >= batchSize) {
      await flush();
    }
  }
  await flush();
  return imported;
}

async function main() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
  }
  const authToken = process.env.CONVEX_AUTH_TOKEN || "";
  const inputPath = argValue("--input", "data/dictionary/normalized");
  const batchSize = parseNumberArg("--batch-size", 100);
  const files = getInputFiles(inputPath);
  const client = new ConvexHttpClient(convexUrl);
  if (authToken) {
    client.setAuth(authToken);
  }

  let total = 0;
  for (const filePath of files) {
    console.log(`Importing ${filePath}`);
    const count = await importFile(client, filePath, batchSize);
    total += count;
    console.log(`Finished ${path.basename(filePath)} (${count} rows)`);
  }
  console.log(`Imported ${total} total rows`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
