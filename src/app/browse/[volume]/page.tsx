import Link from "next/link";
import Breadcrumbs from "@/components/Breadcrumbs";
import { getBibleBooksForVolume } from "@/lib/bibleCanon";

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

export default async function VolumePage({ params }: { params: Promise<{ volume: string }> }) {
  const { volume } = await params;
  const books = volumeToBooks[volume] ?? [];
  return (
    <section className="space-y-6">
      <Breadcrumbs items={[{ label: "Browse", href: "/browse" }, { label: volume.replace(/-/g, " ") }]} />
      <h1 className="text-2xl font-semibold capitalize">{volume.replace(/-/g, " ")}</h1>
      {books.length === 0 ? (
        <p className="text-foreground/80">No book list available for this volume yet.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {books.map((b) => (
            <li key={b.id}>
              <Link
                href={`/browse/${volume}/${b.id}`}
                className="block rounded-lg border surface-card p-4 hover:bg-[var(--surface-button-hover)]"
                data-ripple
              >
                {b.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
