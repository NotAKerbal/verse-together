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
    subtitle: book.subtitle,
    titleOfficial: book.titleOfficial,
  }));
}

export default async function VolumePage({
  params,
}: {
  params: Promise<{ volume: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { volume } = await params;
  const canonicalVolume = normalizeScriptureVolume(volume);
  const volumeSlug = toScriptureVolumeUrlSlug(canonicalVolume);
  if (canonicalVolume === "doctrineandcovenants") {
    redirect(`/browse/${volumeSlug}/doctrineandcovenants`);
  }
  const books = await buildCategorizedBooks(canonicalVolume);
  const volumeLabel = getScriptureVolumeLabel(canonicalVolume);

  return (
    <section className="page-shell">
      {books.length === 0 ? (
        <p className="panel-card rounded-[1.35rem] p-4 text-[color:var(--foreground-muted)]">No book list available for this volume yet.</p>
      ) : (
        <VolumeBookBrowser
          books={books}
          volumeLabel={volumeLabel}
          volumeSlug={volumeSlug}
          backHref="/browse"
        />
      )}
    </section>
  );
}
