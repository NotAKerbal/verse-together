This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Install [`portless`](https://github.com/vercel-labs/portless) first:

```bash
npm install -g portless
```

Then run the development server:

```bash
npm run dev
```

`portless` prints the local hostname it assigns for the app. Open that URL in your browser once the server is ready.

If you need the plain Next.js localhost flow instead, use:

```bash
npm run dev:local
```

That fallback uses the default Next.js development server URL, typically `http://localhost:3000`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Scripture dump artifact

The repo keeps a single retained scripture source artifact at `public/lds-scriptures-2020.12.08/sqlite/lds-scriptures-sqlite.db`. That database is the regeneration input for the checked-in app-native dataset under `public/scripture-data/`.

Generate the app-native scripture manifest and compact per-volume payloads with:

```bash
npm run generate:scriptures
```

This writes:

- `public/scripture-data/manifest.json`
- `public/scripture-data/*.json`

The local runtime and browser IndexedDB installer both read from those generated `public/scripture-data` files.

If you need a one-off export from the SQLite source artifact, derive it from the same database:

```bash
sqlite3 public/lds-scriptures-2020.12.08/sqlite/lds-scriptures-sqlite.db -header -csv "SELECT * FROM scriptures;" > public/lds-scriptures-2020.12.08/csv/lds-scriptures.csv
```

Use the same SQLite database as the source of truth for any other ad hoc export format.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Dictionary Providers

The in-app dictionary now uses public APIs via `src/app/api/tools/dictionary/route.ts`:

- `https://dictionaryapi.dev/` (default source, no key required)
- `https://dictionaryapi.com/` (Merriam-Webster, optional key)

### Optional environment variables

- `MERRIAM_WEBSTER_API_KEY` (or `MW_DICTIONARY_API_KEY`)
- `OPENAI_API_KEY` enables the signed-in Notes assistant and automatic chapter study paths. Chapter research runs server-side with `gpt-5.6-luna`, searches only the configured LDS and Mormon studies sources, and caches grounded results in Convex. The key is never sent to the browser.

If no Merriam-Webster key is configured, only Free Dictionary API entries will be returned.

## Chapter insight batch

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

Submitting is deliberately a separate, explicit action because it creates billable OpenAI work. Test the canary before sending the full file:

```bash
npm run batch:insights:submit -- .batch-output/chapter-insights-v4/canary.jsonl --confirm-submit
```

After validating the canary output, replace `canary.jsonl` with `requests.jsonl` to submit the full set. The submit command writes a local `.submitted.json` receipt beside the request file and never prints the API key.
