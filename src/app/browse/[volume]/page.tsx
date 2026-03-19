import Link from "next/link";
import { redirect } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import ScriptureQuickNav from "@/components/ScriptureQuickNav";
import VolumeBookBrowser, { type VolumeBookBrowserItem } from "@/components/VolumeBookBrowser";
import { getBibleBooksForVolume } from "@/lib/bibleCanon";
import {
  getScriptureVolumeLabel,
  normalizeScriptureVolume,
  toScriptureVolumeUrlSlug,
} from "@/lib/scriptureVolumes";

const volumeToBooks: Record<string, Array<{ id: string; label: string }>> = {
  bookofmormon: [
    { id: "1nephi", label: "1 Nephi" },
    { id: "2nephi", label: "2 Nephi" },
    { id: "jacob", label: "Jacob" },
    { id: "enos", label: "Enos" },
    { id: "jarom", label: "Jarom" },
    { id: "omni", label: "Omni" },
    { id: "wordsofmormon", label: "Words of Mormon" },
    { id: "mosiah", label: "Mosiah" },
    { id: "alma", label: "Alma" },
    { id: "helaman", label: "Helaman" },
    { id: "3nephi", label: "3 Nephi" },
    { id: "4nephi", label: "4 Nephi" },
    { id: "mormon", label: "Mormon" },
    { id: "ether", label: "Ether" },
    { id: "moroni", label: "Moroni" },
  ],
  oldtestament: [
    ...getBibleBooksForVolume("oldtestament").map((book) => ({ id: book.slug, label: book.label })),
  ],
  newtestament: [
    ...getBibleBooksForVolume("newtestament").map((book) => ({ id: book.slug, label: book.label })),
  ],
  doctrineandcovenants: [
    { id: "doctrineandcovenants", label: "Sections" },
  ],
  pearl: [
    { id: "moses", label: "Moses" },
    { id: "abraham", label: "Abraham" },
    { id: "josephsmithmatthew", label: "Joseph Smith—Matthew" },
    { id: "josephsmithhistory", label: "Joseph Smith—History" },
    { id: "articlesoffaith", label: "Articles of Faith" },
  ],
};

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

function buildCategorizedBooks(volume: string): VolumeBookBrowserItem[] {
  const books = volumeToBooks[volume] ?? [];
  const bibleBooks = getBibleBooksForVolume(volume);
  const chaptersBySlug = new Map(bibleBooks.map((book) => [book.slug, book.chapters]));
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
    chapters: chaptersBySlug.get(book.id),
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
  const books = buildCategorizedBooks(canonicalVolume);
  const volumeLabel = getScriptureVolumeLabel(canonicalVolume);

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <Breadcrumbs
          items={[{ label: "Browse", href: lessonId ? `/browse?lessonId=${encodeURIComponent(lessonId)}` : "/browse" }, { label: volumeLabel }]}
        />
        <ScriptureQuickNav currentVolume={canonicalVolume} />
      </div>
      {books.length === 0 ? (
        <p className="text-foreground/80">No book list available for this volume yet.</p>
      ) : (
        <VolumeBookBrowser
          books={books}
          volumeLabel={volumeLabel}
          volumeSlug={volumeSlug}
          lessonSuffix={lessonSuffix}
        />
      )}
    </section>
  );
}
