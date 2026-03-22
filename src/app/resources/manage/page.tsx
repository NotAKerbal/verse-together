import Link from "next/link";
import ResourcesManagerSidebar from "@/components/ResourcesManagerSidebar";

function parseVerseSpec(value: string): { verseStart: number; verseEnd: number } {
  const [startRaw, endRaw] = value.split("-");
  const start = Number(startRaw);
  const end = Number(endRaw ?? startRaw);
  if (!Number.isFinite(start) || start <= 0) return { verseStart: 1, verseEnd: 1 };
  if (!Number.isFinite(end) || end <= 0) return { verseStart: start, verseEnd: start };
  return { verseStart: Math.min(start, end), verseEnd: Math.max(start, end) };
}

export default function ResourceManagerPage({
  searchParams,
}: {
  searchParams?: { volume?: string; book?: string; chapter?: string; verses?: string };
}) {
  const volume = (searchParams?.volume ?? "").toLowerCase();
  const book = (searchParams?.book ?? "").toLowerCase();
  const chapter = Number(searchParams?.chapter ?? "1");
  const verses = searchParams?.verses ?? "1";
  const { verseStart, verseEnd } = parseVerseSpec(verses);

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
      <ResourcesManagerSidebar
        volume={volume}
        book={book}
        chapter={chapter}
        verseStart={verseStart}
        verseEnd={verseEnd}
        onCreated={() => {}}
      />
    </main>
  );
}
