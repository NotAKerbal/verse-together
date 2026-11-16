# Chapter insight batch

The apps no longer show chapter study paths. The batch scripts below and the Convex cache remain,
`/api/insights/chapter` still reads that cache, and the site never generates them on request. `OPENAI_API_KEY` in the
local environment is only for those batch scripts.

These are separate from AI chapter guides, which readers request from the Resources panel; see
[chapter-guides.md](chapter-guides.md).

## Preparing

Prepare the OpenAI Batch API request for every standard-works chapter except the already cached 1 Nephi 1 result:

```bash
npm run batch:insights:prepare
```

This creates ignored artifacts under `.batch-output/chapter-insights-v4/`:

- `canary.jsonl` contains only 1 Nephi 2 and should be submitted first.
- `requests.jsonl` contains the remaining 1,581 chapters.
- `manifest.json` records chapter counts, model and prompt versions, file size, and a SHA-256 checksum.

The batch request uses the same `gpt-5.6-luna` prompt, structured output schema, web-search source allowlist, and adaptive output budget as on-demand generation. There is no hard cap on the number of insights; the model is told to return as many well-grounded directions as the chapter warrants.

Cached chapter insights do not expire on a timer. They remain valid while the local scripture text and chapter-insight prompt version match, so a completed corpus is not regenerated simply because time has passed.

## Submitting

Submitting is deliberately a separate, explicit action because it creates billable OpenAI work. Test the canary before sending the full file:

```bash
npm run batch:insights:submit -- .batch-output/chapter-insights-v4/canary.jsonl --confirm-submit
```

After validating the canary output, replace `canary.jsonl` with `requests.jsonl` to submit the full set. The submit command writes a local `.submitted.json` receipt beside the request file and never prints the API key.
