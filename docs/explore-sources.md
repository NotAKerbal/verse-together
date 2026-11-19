# Dictionary, study helps and Biblical languages

Explore shows the word or passage a reader selects in several sources. This covers where each one comes from.

## Dictionary providers

The in-app dictionary uses public APIs via `src/app/api/tools/dictionary/route.ts`:

- `https://dictionaryapi.dev/` (default source, no key required)
- `https://dictionaryapi.com/` (Merriam-Webster, optional key)

Optional environment variable: `MERRIAM_WEBSTER_API_KEY` (or `MW_DICTIONARY_API_KEY`). If no Merriam-Webster key is
configured, only Free Dictionary API entries will be returned.

## Study helps and Biblical languages

Explore also shows scripture study helps and Biblical language entries inline, without leaving the app:

- **Bible Dictionary, Guide to the Scriptures, and Topical Guide.** The selected word is matched against the
  published topic lists, and the best matching entry in each guide loads as a short preview with "Read more".
  Other matching or related topics, and See also topics within an entry, load in the same card. Scripture
  references open in the reader. `GET /api/tools/study-helps?guide=bd|gs|tg&slug=<topic>` fetches only topics in
  the committed index from churchofjesuschrist.org (10 s timeout, 4 MiB limit, cached for 12 hours, failures not
  cached) and returns the article's text as structured content; the page's markup is never passed to the browser.
  Each entry links to its official page.
- **Hebrew and Greek.** `GET /api/tools/lexicon?language=hebrew|greek&term=<word>` searches the bundled
  OpenScriptures Strong's dictionaries (server only; see [strongs-data.md](strongs-data.md)) for entries whose King James
  renderings, then definitions, use the word. Explore loads the language of the testament being read (Hebrew
  elsewhere) and the other on request. These are candidates for the English word, not the original word of the
  verse; a Bible chapter also links to its Bible Hub interlinear.

These sources need no API keys and load independently of the English dictionary lookup.

Refresh the checked-in topic titles and official URL slugs (entry text is fetched when read, never committed) with:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/generateStudyHelpsIndex.mjs
```
