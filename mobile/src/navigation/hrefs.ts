// The native app's routes are the web app's paths (/browse/…, /notes, /come-follow-me/…), so hrefs built by
// the shared web modules open the same screens. A web fragment ("#v-12", a guide anchor) becomes a query
// parameter, since native screens scroll to it themselves.

import { toScriptureVolumeUrlSlug } from "../shared/web";

// The production site (versetogether.org redirects here). Share links and the Explore APIs use it.
export const WEB_ORIGIN = "https://www.versetogether.org";

/** "/browse/alma/32#v-21" → "/browse/alma/32?verse=21"; "/come-follow-me/2026-10-19#intro" → "…?anchor=intro". */
export function toAppHref(href: string): string {
  const [pathAndQuery, fragment] = href.split("#", 2);
  if (!fragment) return pathAndQuery;
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  const verse = /^v-(\d{1,3})$/.exec(fragment);
  if (verse) return `${pathAndQuery}${separator}verse=${verse[1]}`;
  return `${pathAndQuery}${separator}anchor=${encodeURIComponent(fragment)}`;
}

export function chapterPath(volume: string, book: string, chapter: number, verse?: number): string {
  const base = `/browse/${toScriptureVolumeUrlSlug(volume)}/${book}/${chapter}`;
  return verse ? `${base}?verse=${verse}` : base;
}

/** The public web page for an app path, for sharing (the web app serves the same paths). */
export function webUrl(path: string): string {
  return `${WEB_ORIGIN}${path}`;
}

export function lessonPath(weekStart: string, anchor?: string): string {
  return `/come-follow-me/${weekStart}${anchor ? `?anchor=${encodeURIComponent(anchor)}` : ""}`;
}
