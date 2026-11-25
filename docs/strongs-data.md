# Strong’s Hebrew and Greek data

The inline Biblical language results use the Open Scriptures Strong’s dictionaries:

- [Hebrew source](https://github.com/openscriptures/strongs/blob/0acd2f251c2d35ff8db2dece4e0593979d3ac223/hebrew/strongs-hebrew-dictionary.js): *A Concise Dictionary of the Words in the Hebrew Bible with their Renderings in the King James Version*, James Strong, 1894. JSON copyright 2010, Open Scriptures, CC-BY-SA. The upstream header credits David Instone-Brewer’s corrected public-domain sources and David Troidl’s editing, corrections, and Unicode transliterations.
- [Greek source](https://github.com/openscriptures/strongs/blob/0acd2f251c2d35ff8db2dece4e0593979d3ac223/greek/strongs-greek-dictionary.js): *Dictionary of Greek Words taken from Strong’s Exhaustive Concordance*, James Strong, 1890. JSON copyright 2009, Open Scriptures, CC-BY-SA. The upstream header credits Ulrik Petersen’s 2006 XML version.

Both datasets are pinned to revision `0acd2f251c2d35ff8db2dece4e0593979d3ac223`. The upstream notices specify **CC-BY-SA** without a version. The derived JSON data retains that license and the complete upstream attribution notice. See [Creative Commons Attribution-ShareAlike](https://creativecommons.org/licenses/by-sa/) and the linked upstream sources. This notice applies to the dictionary data, independently of the application code.

`scripts/generateStrongsLexicons.mjs` converts the upstream objects into sorted entries with consistent field names. It trims surrounding whitespace and preserves definitions, derivations, original scripts, transliterations, pronunciation where provided, and KJV renderings. It parses the JSON object without executing the downloaded JavaScript. No definitions are generated or rewritten.

Regenerate the checked-in files with Node 24 or later:

```bash
node scripts/generateStrongsLexicons.mjs
```

For an offline regeneration, save the two original files in a directory and pass `--from-dir DIR`. Their filenames must be `strongs-hebrew-dictionary.js` and `strongs-greek-dictionary.js`.

The datasets are for English-term lexical exploration. An English match does not establish which Hebrew or Greek word appears in a particular verse. Verse-level alignment requires an interlinear or another passage-specific source.
