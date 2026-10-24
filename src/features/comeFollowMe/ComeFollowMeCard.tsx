"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";
import BrowseCard from "@/components/BrowseCard";
import { getStudyGuideHref, hasStudyGuide } from "@/features/comeFollowMe/guideIndex";
import { formatWeekRange, getComeFollowMeWeek, getComeFollowMeWeekByStart } from "@/lib/comeFollowMe";

const noSubscription = () => () => {};
/** This week's start key in the reader's local time; "" outside the schedule. */
const readCurrentWeekStart = () => getComeFollowMeWeek(new Date())?.start ?? "";
/** The server cannot know the reader's date, so the week fills in once hydrated. */
const readServerWeekStart = () => null;

// Heinrich Hofmann, Figure of Christ (1884). Public domain; see docs/browse-art-provenance.md.
const portrait = (
  <Image
    src="/art/hofmann-christ.webp"
    alt=""
    fill
    sizes="(min-width: 1024px) 12rem, (min-width: 640px) 23vw, 45vw"
    className="object-cover object-[50%_20%]"
  />
);

/** The whole card opens this week's lesson; weeks without a guide still have their reading page. */
export default function ComeFollowMeCard({ className }: { className?: string }) {
  const weekStart = useSyncExternalStore(noSubscription, readCurrentWeekStart, readServerWeekStart);
  const week = weekStart ? getComeFollowMeWeekByStart(weekStart) : null;

  if (!week) {
    // Before hydration, or outside the published schedule: the guide index is always there.
    return (
      <BrowseCard
        href="/come-follow-me"
        className={className}
        media={portrait}
        eyebrow="Come, Follow Me"
        title={weekStart === null ? "This week" : "Study guides"}
      />
    );
  }

  return (
    <BrowseCard
      href={getStudyGuideHref(week.start)}
      className={className}
      media={portrait}
      eyebrow={`Come, Follow Me · ${formatWeekRange(week)}`}
      title={week.block}
      description={hasStudyGuide(week.start) ? "This week's study guide" : "This week's reading"}
    />
  );
}
