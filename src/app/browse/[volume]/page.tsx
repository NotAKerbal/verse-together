import Link from "next/link";
import { redirect } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import ScriptureQuickNav from "@/components/ScriptureQuickNav";
import { getBibleBooksForVolume } from "@/lib/bibleCanon";
import {
  getScriptureVolumeLabel,
  normalizeScriptureVolume,
  toScriptureVolumeUrlSlug,
} from "@/lib/scriptureVolumes";
import { getBookAbbreviation } from "@/lib/scriptureQuickNav";

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
  const canonicalVolume = normalizeScriptureVolume(volume);
  const volumeSlug = toScriptureVolumeUrlSlug(canonicalVolume);
  if (canonicalVolume === "doctrineandcovenants") {
    redirect(`/browse/${volumeSlug}/doctrineandcovenants`);
  }
  const books = volumeToBooks[canonicalVolume] ?? [];
  const volumeLabel = getScriptureVolumeLabel(canonicalVolume);

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <Breadcrumbs items={[{ label: "Browse", href: "/browse" }, { label: volumeLabel }]} />
        <ScriptureQuickNav currentVolume={canonicalVolume} />
      </div>
      <h1 className="text-2xl font-semibold">{volumeLabel}</h1>
      {books.length === 0 ? (
        <p className="text-foreground/80">No book list available for this volume yet.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {books.map((b) => (
            <li key={b.id}>
              <Link
                href={`/browse/${volumeSlug}/${b.id}`}
                className="block rounded-lg border surface-card p-4 hover:bg-[var(--surface-button-hover)]"
                data-ripple
              >
                <div className="font-medium">{b.label}</div>
                {getBookAbbreviation(b.id) ? (
                  <div className="mt-1 inline-flex items-center rounded-full border border-black/10 dark:border-white/15 px-2 py-0.5 text-xs text-foreground/70">
                    {getBookAbbreviation(b.id)}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
