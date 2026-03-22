"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ResourcesManagerSidebar from "@/components/ResourcesManagerSidebar";

function parseVerseSpec(value: string): { verseStart: number; verseEnd: number } {
  const [startRaw, endRaw] = value.split("-");
  const start = Number(startRaw);
  const end = Number(endRaw ?? startRaw);
  if (!Number.isFinite(start) || start <= 0) return { verseStart: 1, verseEnd: 1 };
  if (!Number.isFinite(end) || end <= 0) return { verseStart: start, verseEnd: start };
  return { verseStart: Math.min(start, end), verseEnd: Math.max(start, end) };
}

export default function ResourceManagerPage() {
  const searchParams = useSearchParams();
  const volume = (searchParams.get("volume") ?? "").toLowerCase();
  const book = (searchParams.get("book") ?? "").toLowerCase();
  const chapter = Number(searchParams.get("chapter") ?? "1");
  const verses = searchParams.get("verses") ?? "1";
  const { verseStart, verseEnd } = useMemo(() => parseVerseSpec(verses), [verses]);
  const [saveCount, setSaveCount] = useState(0);

  if (!volume || !book || !Number.isFinite(chapter) || chapter <= 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 space-y-3">
        <h1 className="text-lg font-semibold">Resource Manager</h1>
        <p className="text-sm text-foreground/70">Missing required query parameters. Open this page from the Resources panel.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Resource Manager</h1>
        <Link href={`/browse/${volume}/${book}/${chapter}#v-${verseStart}`} className="rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm">
          Back to chapter
        </Link>
      </div>
      <p className="text-sm text-foreground/70">
        Managing resources for <span className="font-medium">{book.replace(/-/g, " ")} {chapter}:{verseStart}{verseEnd !== verseStart ? `-${verseEnd}` : ""}</span>.
      </p>
      {saveCount > 0 ? <p className="text-sm text-emerald-700 dark:text-emerald-300">Saved successfully.</p> : null}
      <ResourcesManagerSidebar
        volume={volume}
        book={book}
        chapter={chapter}
        verseStart={verseStart}
        verseEnd={verseEnd}
        onCreated={() => setSaveCount((value) => value + 1)}
      />
    </main>
  );
}
