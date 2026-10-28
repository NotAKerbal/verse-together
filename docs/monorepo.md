# Verse Together apps in one repository

The repository contains the web, Android/iOS and native Rust desktop apps, with one shared scripture and lesson
source. `apps.json` is the app inventory; `scripts/apps.mjs` runs commands in the correct app directory.

| App | Source | Install | Start | Check |
| --- | --- | --- | --- | --- |
| Web | `src/`, project root | `npm ci` | `npm run app -- web dev` | `npm run app -- web check` |
| Android/iOS | `mobile/` | `npm ci --prefix mobile` | `npm run app -- mobile dev` | `npm run app -- mobile check` |
| Rust desktop | `native/` | Rust 1.88+; Cargo installs locked dependencies | `npm run app -- desktop dev` | `npm run app -- desktop check` |

Run `npm run apps` to list apps, `npm run apps:check` to check them sequentially, or
`npm run app -- --dry-run --all check` to inspect the commands without executing them. Desktop commands can also
be run directly with Cargo from `native/`; Node is only needed for regenerating the shared release-note data.
Mobile uses its custom native scripture-text module, so Expo Go cannot run it. See each app's README for SDKs,
configuration, signed builds and platform limitations.

## Shared boundaries

- `public/scripture-data/` and `src/lib/generated/scriptureCatalog.json`: canonical scripture text and catalog.
- `content/cfm/`: published Come, Follow Me guides. Mobile generates native data from the web parser; Rust embeds
  the catalog and source guides at build time. Regenerate mobile data with `npm run generate --prefix mobile`.
- `public/brand/`, `public/art/` and `public/cfm/`: branding and artwork, with their existing provenance and credits.
- `convex/`: the shared backend, including web, mobile and desktop authentication and study APIs.
- Pure study, anchor and annotation modules under `src/` and `convex/` are imported by mobile through its explicit
  shared-module boundary. Rust keeps its own native implementations and compatibility tests.
- `src/lib/releaseNotes.ts`: website release history. Regenerate the desktop copy with
  `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON native/scripts/generate-release-notes.mjs`.

## Dependencies and releases

The web and mobile retain separate `package.json`, lockfile and `node_modules` directories. Their React, TypeScript
and bundler versions differ; installation at the repository root does not install or hoist mobile dependencies.
Rust retains `native/Cargo.lock` and its documented renderer patch under `native/vendor/`. The root web compiler
and linter exclude the native apps; their own checks run through the app commands.

Versions are independent: root `package.json` is the website release; `mobile/app.json` is the mobile store version
and platform build numbers; `native/Cargo.toml` versions the Rust app. A web merge into `master` follows AGENTS.md.
Merging app sources into `dev` does not publish a Play release or desktop package. Never commit upload keys,
environment files, caches, build outputs, study databases or account sessions.

## Deployment and next steps

The web app and Convex functions stay at their existing paths, so Vercel's project root and backend deployment
configuration remain unchanged. `dev` remains integration/development; `master` remains production. The obsolete
Tauri/webview experiment is retained in Git history and is not an active fourth app.

This is the first consolidation step. Extracting pure shared modules into explicit packages, moving the web under
an `apps/` directory, and introducing affected-app CI can follow as separate changes with deployment-path tests.
Do not move the shared backend or change provider project roots as part of an unrelated app change.

## Initial source consolidation

The integration starts from dev `a7ed47c`. Mobile UI source is preserved at `1dff2cc`, combining the reviewed
Settings (`bbbb4ab`), Explore (`e3d88cc`) and CFM (`e6da5a3`) deltas; account sync comes from `4191b30` with the
CFM read/write and editor-ownership connections added during integration. Rust source comes only from `native/`
at `3b39252`, with release data regenerated from this repository and its history-range UI test made data-driven.
The older branches' backend and Tauri history are not merged.

The released Android 1.0.5 UI build is a separate artifact and excludes account sync. Merging the newer source
does not change that already-uploaded bundle; a later mobile release needs its own version/build number and QA.
