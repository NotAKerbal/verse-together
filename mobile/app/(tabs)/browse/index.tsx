import { useRouter } from "expo-router";
import BrowseCard from "../../../src/components/BrowseCard";
import Grid from "../../../src/components/Grid";
import { SearchPill } from "../../../src/components/SelectionHeader";
import { Page } from "../../../src/components/ui";
import { chapterPath } from "../../../src/navigation/hrefs";
import { PUBLISHED_GUIDES } from "../../../src/cfm/guides";
import {
  buildLibraryVolumes,
  formatChapterLabel,
  formatWeekRange,
  getComeFollowMeWeek,
  scriptureCatalog,
} from "../../../src/shared/web";
import { useLastPosition, useSimpleMode } from "../../../src/storage/preferences";

// Original generated scenery, with no people or figures (docs/browse-art-provenance.md).
const VOLUME_ART: Record<string, string> = {
  bookofmormon: "/art/browse-bookofmormon.webp",
  oldtestament: "/art/browse-oldtestament.webp",
  newtestament: "/art/browse-newtestament.webp",
  doctrineandcovenants: "/art/browse-doctrineandcovenants.webp",
  pearl: "/art/browse-pearl.webp",
};

const LIBRARY_VOLUMES = buildLibraryVolumes(scriptureCatalog);

function ComeFollowMeCard() {
  const router = useRouter();
  const week = getComeFollowMeWeek(new Date());
  const open = () => router.navigate("/come-follow-me");
  if (!week) return <BrowseCard image="/art/browse-come-follow-me.webp" eyebrow="Come, Follow Me" title="Study guides" onPress={open} />;
  const hasGuide = PUBLISHED_GUIDES.some((guide) => guide.startDate === week.start);
  return (
    <BrowseCard
      image="/art/browse-come-follow-me.webp"
      eyebrow={`Come, Follow Me · ${formatWeekRange(week)}`}
      title={week.block}
      description={hasGuide ? "This week's study guide" : "This week's reading"}
      onPress={open}
      testID="card-come-follow-me"
    />
  );
}

function ContinueReadingCard() {
  const router = useRouter();
  const position = useLastPosition();
  if (!position) return null;
  const label = formatChapterLabel(position);
  const delineation = position.volume === "doctrineandcovenants" || position.volume === "dnc" ? "section" : "chapter";
  return (
    <BrowseCard
      image="/art/browse-continue-reading.webp"
      eyebrow="Continue reading"
      title={label}
      description={`Pick up the ${delineation} you had open.`}
      accessibilityLabel={`Continue reading ${label}`}
      onPress={() => router.push(chapterPath(position.volume, position.book, position.chapter))}
      testID="card-continue-reading"
    />
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const [simple] = useSimpleMode();
  return (
    <Page gap={16}>
      {simple ? null : <SearchPill onPress={() => router.push("/search")} />}
      <Grid>
        {simple ? null : <ComeFollowMeCard />}
        {simple ? null : <ContinueReadingCard />}
        {simple ? null : (
          <BrowseCard
            image="/art/browse-notes.webp"
            eyebrow="Study journal"
            title="Journal"
            description="Your notes and reading"
            onPress={() => router.navigate("/notes")}
          />
        )}
        {LIBRARY_VOLUMES.map((volume) => (
          <BrowseCard
            key={volume.id}
            image={VOLUME_ART[volume.id]}
            eyebrow={`${volume.shortLabel}${volume.id !== "doctrineandcovenants" ? ` · ${volume.chapterCount} chapters` : ""}`}
            title={volume.label}
            onPress={() => router.push(volume.href as never)}
            testID={`volume-${volume.id}`}
          />
        ))}
      </Grid>
    </Page>
  );
}
