import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { ConvexHttpClient } from "convex/browser";
import { generateLookupCandidates } from "./normalizeLookupKey.mjs";

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

async function countJsonlByEdition(filePath) {
  const countByEdition = { "1828": 0, "1844": 0, "1913": 0 };
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed);
    if (row.edition in countByEdition) {
      countByEdition[row.edition] += 1;
    }
  }
  return countByEdition;
}

async function queryTerm(client, term) {
  return client.query("dictionary:getEntriesByWord", { term });
}

async function verifySamples(client, samples) {
  const results = [];
  for (const term of samples) {
    const res = await queryTerm(client, term);
    const byEdition = res.byEdition ?? {};
    results.push({
      term,
      candidates: generateLookupCandidates(term).join(", "),
      found1828: Array.isArray(byEdition["1828"]?.entries) && byEdition["1828"].entries.length > 0,
      found1844: Array.isArray(byEdition["1844"]?.entries) && byEdition["1844"].entries.length > 0,
      found1913: Array.isArray(byEdition["1913"]?.entries) && byEdition["1913"].entries.length > 0,
    });
  }
  return results;
}

async function main() {
  const input = path.resolve(argValue("--input", "data/dictionary/normalized/dictionary-all.jsonl"));
  if (!fs.existsSync(input)) {
    throw new Error(`Input JSONL not found: ${input}`);
  }

  const counts = await countJsonlByEdition(input);
  console.log(`Verified JSONL counts from ${input}`);
  console.table(counts);

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    console.log("Skipping live Convex checks (NEXT_PUBLIC_CONVEX_URL is not set).");
    return;
  }

  const client = new ConvexHttpClient(convexUrl);
  const authToken = process.env.CONVEX_AUTH_TOKEN;
  if (authToken) client.setAuth(authToken);

  const sampleTerms = argValue("--samples", "abandon,charity,zeal,blessings,heavens")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const sampleResults = await verifySamples(client, sampleTerms);
  console.log("Sample lookup verification:");
  console.table(sampleResults);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
