# Unreleased release notes

Each user-visible change waiting for the next dev-to-master release has its own file here, so branches don't
conflict over one list. Settings → Release notes shows them as "Upcoming changes", and cutting a release moves them
into `RELEASES` in `src/lib/releaseNotes.ts` and deletes them. See "Releases" in `AGENTS.md`.

Name the file for what changed, in lowercase words joined by hyphens, such as `journal-prompts.json`:

```json
{
  "kind": "improved",
  "text": "The journal’s invitation to reflect shows a different question and artwork each time you visit."
}
```

- `kind`: `"new"` for a new feature, `"improved"` for a change to an existing one.
- `text`: what changed, in a sentence or two of plain words for readers. No two entries may say the same thing.
- `commits` (optional): the short hashes of the commits the entry describes, such as `["b6af8f80"]`. Without it, the
  release uses the commit that added the file, so give it when the change is in other commits.
- `screenshot` (optional, usually added when the release is prepared): `src` (a file under `public/release-notes/`,
  given as `/release-notes/<version>-<feature>.webp`), `width` and `height` in pixels, `alt` and `caption`. Leave
  `currentInterface` off; see "Release screenshots" in `AGENTS.md`.

Files starting with `_` and this README are ignored. `npm run release:check` checks every entry.
