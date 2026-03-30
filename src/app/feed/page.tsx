import CuratedFeed from "@/components/CuratedFeed";
import { getCuratedFeedSectionSummaries } from "@/lib/feedCatalog";
import { isSpotifyConfigured } from "@/lib/spotify";

export const revalidate = 1800;

export default async function FeedPage() {
  const configured = isSpotifyConfigured();
  const sectionSummaries = getCuratedFeedSectionSummaries();

  return (
    <section className="page-shell py-4 sm:py-8">
      <CuratedFeed
        configured={configured}
        sectionSummaries={sectionSummaries}
        initialSection={null}
      />
    </section>
  );
}
