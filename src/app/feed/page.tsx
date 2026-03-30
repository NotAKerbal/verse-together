import CuratedFeed from "@/components/CuratedFeed";
import { getCuratedFeedSections } from "@/lib/feedCatalog";

export const revalidate = 1800;

export default async function FeedPage() {
  const { configured, sections } = await getCuratedFeedSections();

  return (
    <section className="page-shell py-4 sm:py-8">
      <CuratedFeed configured={configured} sections={sections} />
    </section>
  );
}
