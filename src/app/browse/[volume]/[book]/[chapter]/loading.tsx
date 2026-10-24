"use client";

import { useParams } from "next/navigation";
import ChapterReaderSkeleton from "@/components/ChapterReaderSkeleton";
import { describeChapterTarget, parseBrowseChapterHref } from "@/lib/browseRoutes";
import { scriptureCatalog } from "@/lib/scriptureCatalog";

// Streamed first for a direct load or reload, and shown by any navigation the browse provider did not start,
// while the chapter's server render is on its way.
export default function ChapterLoading() {
  const params = useParams<{ volume: string; book: string; chapter: string }>();
  const target = params ? parseBrowseChapterHref(`/browse/${params.volume}/${params.book}/${params.chapter}`) : null;
  return <ChapterReaderSkeleton reference={target ? describeChapterTarget(scriptureCatalog, target) : null} />;
}
