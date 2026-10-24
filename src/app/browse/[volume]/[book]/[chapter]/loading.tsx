"use client";

import { useParams, useSearchParams } from "next/navigation";
import { ChapterReaderShell } from "@/components/ChapterReaderChrome";
import { chapterChromeForHref } from "@/lib/browseRoutes";
import { scriptureCatalog } from "@/lib/scriptureCatalog";

// The chapter's page before its route's response has arrived (e.g. a prefetched link commits straight to this):
// the same header, breadcrumbs, and links the page will have, with the text area empty. The page itself streams
// without waiting for the text, so this is only up until the response begins.
export default function ChapterLoading() {
  const params = useParams<{ volume: string; book: string; chapter: string }>();
  const searchParams = useSearchParams();
  const query = searchParams?.toString();
  const chrome = params
    ? chapterChromeForHref(scriptureCatalog, `/browse/${params.volume}/${params.book}/${params.chapter}${query ? `?${query}` : ""}`)
    : null;
  return chrome ? <ChapterReaderShell chrome={chrome} /> : null;
}
