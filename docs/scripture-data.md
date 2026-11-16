# Scripture data

The repo keeps a single retained scripture source artifact at `public/lds-scriptures-2020.12.08/sqlite/lds-scriptures-sqlite.db`. That database is the regeneration input for the checked-in app-native dataset under `public/scripture-data/`.

The database is release 2020.12.08 of [beandog/lds-scriptures](https://github.com/beandog/lds-scriptures) ([scriptures.nephi.org](https://scriptures.nephi.org/)), unmodified. Upstream states it is public domain. Its source, terms and what it omits are recorded in [`public/lds-scriptures-2020.12.08/README.md`](../public/lds-scriptures-2020.12.08/README.md). Artwork provenance is recorded in [`public/art/README.md`](../public/art/README.md).

## Regenerating

Generate the app-native scripture manifest and compact per-volume payloads with:

```bash
npm run generate:scriptures
```

This writes:

- `public/scripture-data/manifest.json`
- `public/scripture-data/*.json`
- `src/lib/generated/scriptureCatalog.json`: the small navigation catalog (volumes, books, chapter and verse counts) that browse, quick navigation, and server lookups read instead of the verse bundles. `npm run generate:scriptures -- --catalog-only` rebuilds just this file from the bundles already in `public/scripture-data`, and `npm run test:browse` checks that it matches them.

The local runtime and browser IndexedDB installer both read from those generated `public/scripture-data` files.

## One-off exports

If you need a one-off export from the SQLite source artifact, derive it from the same database:

```bash
sqlite3 public/lds-scriptures-2020.12.08/sqlite/lds-scriptures-sqlite.db -header -csv "SELECT * FROM scriptures;" > public/lds-scriptures-2020.12.08/csv/lds-scriptures.csv
```

Use the same SQLite database as the source of truth for any other ad hoc export format.
