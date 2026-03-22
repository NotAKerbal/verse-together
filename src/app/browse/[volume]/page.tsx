import { redirect } from "next/navigation";
import VolumeBookBrowser, { type VolumeBookBrowserItem } from "@/components/VolumeBookBrowser";
import { getLocalLdsBooks } from "@/lib/ldsLocalData.server";
import {
  getScriptureVolumeLabel,
  normalizeScriptureVolume,
  toScriptureVolumeUrlSlug,
} from "@/lib/scriptureVolumes";

const OLD_TESTAMENT_GROUPS: Array<{ label: string; books: string[] }> = [
  { label: "Law", books: ["genesis", "exodus", "leviticus", "numbers", "deuteronomy"] },
  {
    label: "History",
    books: [
      "joshua",
      "judges",
      "ruth",
      "1samuel",
      "2samuel",
      "1kings",
      "2kings",
      "1chronicles",
      "2chronicles",
      "ezra",
      "nehemiah",
      "esther",
    ],
  },
  { label: "Wisdom", books: ["job", "psalms", "proverbs", "ecclesiastes", "songofsolomon"] },
  { label: "Major Prophets", books: ["isaiah", "jeremiah", "lamentations", "ezekiel", "daniel"] },
  {
    label: "Minor Prophets",
    books: [
      "hosea",
      "joel",
      "amos",
      "obadiah",
      "jonah",
      "micah",
      "nahum",
      "habakkuk",
      "zephaniah",
      "haggai",
      "zechariah",
      "malachi",
    ],
  },
];

const NEW_TESTAMENT_GROUPS: Array<{ label: string; books: string[] }> = [
  { label: "Gospels", books: ["matthew", "mark", "luke", "john"] },
  { label: "History", books: ["acts"] },
  {
    label: "Pauline Epistles",
    books: [
      "romans",
      "1corinthians",
      "2corinthians",
      "galatians",
      "ephesians",
      "philippians",
      "colossians",
      "1thessalonians",
      "2thessalonians",
      "1timothy",
      "2timothy",
      "titus",
      "philemon",
      "hebrews",
    ],
  },
  { label: "General Epistles", books: ["james", "1peter", "2peter", "1john", "2john", "3john", "jude"] },
  { label: "Apocalypse", books: ["revelation"] },
];

async function buildCategorizedBooks(volume: string): Promise<VolumeBookBrowserItem[]> {
  const books = await getLocalLdsBooks(volume);
  const groups =
    volume === "oldtestament"
      ? OLD_TESTAMENT_GROUPS
      : volume === "newtestament"
        ? NEW_TESTAMENT_GROUPS
        : [];
  const categoryBySlug = new Map<string, string>();
  groups.forEach((group) => {
    group.books.forEach((slug) => categoryBySlug.set(slug, group.label));
  });

  return books.map((book) => ({
    id: book.id,
    label: book.label,
    chapters: book.chapters,
    category: categoryBySlug.get(book.id),
  }));
}

export default async function VolumePage({
  params,
  searchParams,
}: {
  params: Promise<{ volume: string }>;
  searchParams: Promise<{ lessonId?: string | string[] }>;
}) {
  const { volume } = await params;
  const query = await searchParams;
  const lessonId = Array.isArray(query.lessonId) ? query.lessonId[0] : query.lessonId;
  const lessonSuffix = lessonId ? `?lessonId=${encodeURIComponent(lessonId)}` : "";
  const canonicalVolume = normalizeScriptureVolume(volume);
  const volumeSlug = toScriptureVolumeUrlSlug(canonicalVolume);
  if (canonicalVolume === "doctrineandcovenants") {
    redirect(`/browse/${volumeSlug}/doctrineandcovenants${lessonSuffix}`);
  }
  const books = await buildCategorizedBooks(canonicalVolume);
  const volumeLabel = getScriptureVolumeLabel(canonicalVolume);
  const browseHref = lessonId ? `/browse?lessonId=${encodeURIComponent(lessonId)}` : "/browse";

  return (
    <section className="space-y-6">
      {books.length === 0 ? (
        <p className="text-foreground/80">No book list available for this volume yet.</p>
      ) : (
        <VolumeBookBrowser
          books={books}
          volumeLabel={volumeLabel}
          volumeSlug={volumeSlug}
          backHref={browseHref}
          lessonSuffix={lessonSuffix}
        />
      )}
    </section>
  );
}
