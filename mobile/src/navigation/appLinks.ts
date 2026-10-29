// Verified Android App Links: the website's scripture links (www.versetogether.org/browse/… and /share/…) open in
// the app (android.intentFilters in app.json; the site's /.well-known/assetlinks.json, src/lib/androidAppLinks.ts).
// Expo Router hands every incoming URL to app/+native-intent.tsx, which maps it here to an app path.
//
// The URL is parsed by hand, not with URL: React Native's URL is a loose approximation of the one Jest runs on,
// so the two would disagree on odd input. Only the shapes the website serves pass; anything else on the site opens
// the Browse library, and a link to another site opens the app's home.

import { normalizeScriptureVolume, scriptureCatalog, toScriptureVolumeUrlSlug } from "../shared/web";
import { WEB_ORIGIN } from "./hrefs";

/** The one host the app verifies. versetogether.org redirects here, and Android doesn't verify through redirects. */
export const APP_LINK_HOST = WEB_ORIGIN.replace(/^https:\/\//, "");

/** The intent filter's paths (app.json): the library, a volume, book or chapter, and a shared passage. */
export const APP_LINK_PATHS = { exact: ["/browse"], prefixes: ["/browse/", "/share/"] } as const;

const HOME = "/";
const LIBRARY = "/browse";
const SLUG = /^[a-z0-9-]{1,40}$/;
const CHAPTER = /^[1-9]\d{0,2}$/;
// A share link's verse spec ("27", "21-28", "3,21-28"; en dashes and spaces allowed, as the web parses it).
const VERSE_SPEC = /^[0-9 ,;\-–—]{1,80}$/;
// A comparison translation id (the web chapter's `translation`/`compare` parameters).
const TRANSLATION = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_TRANSLATIONS = 4;

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

function queryValues(query: string, key: string): string[] {
  const values: string[] = [];
  for (const pair of query.split("&")) {
    const [rawKey, rawValue = ""] = pair.split("=", 2);
    if (decode(rawKey) !== key) continue;
    const value = decode(rawValue);
    if (value !== null) values.push(value);
  }
  return values;
}

function browsePath(segments: string[], query: string, fragment: string): string {
  const [rawVolume, book, rawChapter] = segments;
  if (!rawVolume || !SLUG.test(rawVolume)) return LIBRARY;
  const volume = normalizeScriptureVolume(rawVolume);
  if (!scriptureCatalog.getVolume(volume)) return LIBRARY;
  const volumePath = `${LIBRARY}/${toScriptureVolumeUrlSlug(volume)}`;
  if (book === undefined) return volumePath;
  const entry = SLUG.test(book) ? scriptureCatalog.getBook(volume, book) : null;
  if (!entry) return volumePath;
  const bookPath = `${volumePath}/${book}`;
  if (rawChapter === undefined) return bookPath;
  if (!CHAPTER.test(rawChapter) || !scriptureCatalog.hasChapter(volume, book, Number(rawChapter))) return bookPath;
  const chapter = Number(rawChapter);
  const params: string[] = [];
  // The web's verse anchor (#v-21) is the reader's `verse` parameter (as toAppHref in hrefs.ts maps it).
  const verse = /^v-([1-9]\d{0,2})$/.exec(fragment);
  if (verse && Number(verse[1]) <= (entry.verseCounts[chapter - 1] ?? 0)) params.push(`verse=${verse[1]}`);
  for (const key of ["translation", "compare"]) {
    const values = queryValues(query, key).filter((value) => TRANSLATION.test(value));
    for (const value of values.slice(0, MAX_TRANSLATIONS)) params.push(`${key}=${encodeURIComponent(value)}`);
  }
  return `${bookPath}/${chapter}${params.length ? `?${params.join("&")}` : ""}`;
}

/** /share/<volume>/<book>/<chapter>/<verses>; app/share/… checks that it names verses in the library. */
function sharePath(segments: string[]): string {
  if (segments.length !== 4) return LIBRARY;
  const [volume, book, chapter, rawVerses] = segments;
  const verses = decode(rawVerses);
  if (!SLUG.test(volume) || !SLUG.test(book) || !CHAPTER.test(chapter) || verses === null || !VERSE_SPEC.test(verses)) return LIBRARY;
  return `/share/${volume}/${book}/${chapter}/${encodeURIComponent(verses)}`;
}

/** The app path for a website URL the app was opened with, or null when it isn't one of the website's (https) links. */
export function appPathForWebsiteUrl(url: string): string | null {
  const match = /^https:\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i.exec(url);
  if (!match) return null;
  const [, authority, rawPath, query = "", fragment = ""] = match;
  // Anything but the exact host (another site, a port, user info) isn't the website.
  if (authority.toLowerCase() !== APP_LINK_HOST) return null;
  const path = rawPath.length > 1 ? rawPath.replace(/\/$/, "") : rawPath;
  const [first, ...rest] = path.split("/").slice(1);
  if (rest.some((segment) => segment === "")) return LIBRARY;
  if (first === "browse") return browsePath(rest, query, fragment);
  if (first === "share") return sharePath(rest);
  return LIBRARY;
}

/**
 * Expo Router's redirectSystemPath (app/+native-intent.tsx): website links become app paths; any other http(s)
 * link opens the home screen rather than whatever its path names; the app's own scheme (versetogether://, which
 * Google sign-in returns to) and in-app paths pass through unchanged.
 */
export function appPathForSystemUrl(url: string): string {
  if (!/^https?:/i.test(url)) return url;
  return appPathForWebsiteUrl(url) ?? HOME;
}
