import BrowseCard from "@/components/BrowseCard";
import SelectionHeader from "@/components/SelectionHeader";
import ComeFollowMeCard from "@/features/comeFollowMe/ComeFollowMeCard";
import ContinueReadingCard from "@/features/plans/ContinueReadingCard";
import { getLocalLdsVolumes } from "@/lib/ldsLocalData.server";

const VOLUME_TINTS: Record<string, string> = {
  bookofmormon: "var(--accent-primary)",
  oldtestament: "var(--surface-card)",
  newtestament: "var(--accent-sky-soft)",
  doctrineandcovenants: "var(--surface-card)",
  pearl: "var(--accent-mint)",
};

export default async function BrowsePage({
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const commonVolumes = await getLocalLdsVolumes();

  return (
    <section className="page-shell browse-shell">
      <SelectionHeader title="Library" showLibrarySearch />
      {/* One grid: study cards first (hidden in simple mode), then the volumes. Continue Reading
          renders nothing without a saved position, so it never leaves a gap. */}
      <ul className="browse-grid browse-library">
        <ComeFollowMeCard className="simple-hide" />
        <ContinueReadingCard className="simple-hide" />
        <BrowseCard
          href="/notes"
          className="simple-hide"
          eyebrow="Study journal"
          title="Notes"
          description="Your study notes"
        />
        {commonVolumes.map((volume) => (
          <BrowseCard
            key={volume.id}
            href={`/browse/${volume.id}`}
            background={VOLUME_TINTS[volume.id] ?? "var(--surface-card)"}
            eyebrow={`${volume.shortLabel}${volume.id !== "doctrineandcovenants" ? ` · ${volume.chapterCount} chapters` : ""}`}
            title={volume.label}
          />
        ))}
      </ul>
    </section>
  );
}
