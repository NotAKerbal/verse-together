import Link from "next/link";
import ScriptureQuickNav from "@/components/ScriptureQuickNav";

const commonVolumes = [
  { id: "bookofmormon", label: "Book of Mormon" },
  { id: "oldtestament", label: "Old Testament" },
  { id: "newtestament", label: "New Testament" },
  { id: "dnc", label: "Doctrine & Covenants" },
  { id: "pearl", label: "Pearl of Great Price" },
];

export default function BrowsePage() {
  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Browse Scriptures</h1>
          <p className="text-foreground/80 mt-2">Pick a volume to start reading.</p>
        </div>
        <ScriptureQuickNav />
      </header>
      <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {commonVolumes.map((v) => (
          <li key={v.id}>
            <Link
              href={`/browse/${v.id}`}
              className="block rounded-lg border surface-card p-4 hover:bg-[var(--surface-button-hover)]"
              data-ripple
            >
              <div className="font-medium">{v.label}</div>
              <div className="text-sm text-foreground/70">English (LDS)</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
