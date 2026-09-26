import Link from "next/link";
import SelectionHeader from "@/components/SelectionHeader";
import { getLocalLdsVolumes } from "@/lib/ldsLocalData.server";

const VOLUME_TINTS: Record<string, string> = {
  bookofmormon: "var(--accent-primary)",
  oldtestament: "var(--surface-card)",
  newtestament: "var(--accent-sky-soft)",
  doctrineandcovenants: "var(--surface-card)",
  pearl: "var(--accent-mint)",
};

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export default async function BrowsePage({
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const commonVolumes = await getLocalLdsVolumes();

  return (
    <section className="page-shell browse-shell">
      <SelectionHeader title="Library" />
      <ul className="browse-grid">
        {commonVolumes.map((volume) => (
          <li key={volume.id} className={volume.id === "pearl" ? "sm:col-span-2 lg:col-span-1" : ""}>
            <Link
              href={`/browse/${volume.id}`}
              className="panel-card interactive-card group flex h-full min-h-[8.5rem] flex-col justify-between gap-3 px-5 py-5"
              style={{ background: VOLUME_TINTS[volume.id] ?? "var(--surface-card)" }}
              data-tap
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[color:var(--foreground-muted)]">
                  {volume.shortLabel}
                  {volume.id !== "doctrineandcovenants" ? ` · ${volume.chapterCount} chapters` : ""}
                </span>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] text-[color:var(--foreground)] transition-transform duration-150 group-hover:translate-x-0.5">
                  <ChevronIcon />
                </span>
              </div>
              <div className="font-display text-[1.6rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground">
                {volume.label}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
