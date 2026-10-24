import BrowseCard, { type BrowseCardImage } from "@/components/BrowseCard";
import SelectionHeader from "@/components/SelectionHeader";
import ComeFollowMeCard from "@/features/comeFollowMe/ComeFollowMeCard";
import ContinueReadingCard from "@/features/plans/ContinueReadingCard";
import { getLocalLdsVolumes } from "@/lib/ldsLocalData.server";

// Original generated scenery, with no people or figures; see docs/browse-art-provenance.md.
const VOLUME_ART: Record<string, BrowseCardImage> = {
  bookofmormon: { src: "/art/browse-bookofmormon.webp" },
  oldtestament: { src: "/art/browse-oldtestament.webp" },
  newtestament: { src: "/art/browse-newtestament.webp" },
  doctrineandcovenants: { src: "/art/browse-doctrineandcovenants.webp" },
  pearl: { src: "/art/browse-pearl.webp" },
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
          image={{ src: "/art/browse-notes.webp" }}
          eyebrow="Study journal"
          title="Notes"
          description="Your study notes"
        />
        {commonVolumes.map((volume) => (
          <BrowseCard
            key={volume.id}
            href={`/browse/${volume.id}`}
            image={VOLUME_ART[volume.id]}
            eyebrow={`${volume.shortLabel}${volume.id !== "doctrineandcovenants" ? ` · ${volume.chapterCount} chapters` : ""}`}
            title={volume.label}
          />
        ))}
      </ul>
    </section>
  );
}
