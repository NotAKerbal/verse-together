"use client";

import { useFaithTradition } from "@/lib/useFaithTradition";
import { isLdsVolume } from "@/lib/faithTradition";

import BrowseCard from "@/components/BrowseCard";
import { formatChapterLabel, getChapterDelineation, getChapterHref } from "./scriptureCatalog";
import { useLastPosition } from "./useReadingProgress";

export default function ContinueReadingCard({ className }: { className?: string }) {
  const { showLdsContent } = useFaithTradition();
  const position = useLastPosition();
  if (!position || (!showLdsContent && isLdsVolume(position.volume))) return null;

  const label = formatChapterLabel(position);
  const delineation = getChapterDelineation(position.volume).toLowerCase();

  return (
    <BrowseCard
      href={getChapterHref(position)}
      className={className}
      ariaLabel={`Continue reading ${label}`}
      eyebrow="Continue reading"
      image={{ src: "/art/browse-continue-reading.webp" }}
      title={label}
      description={`Pick up the ${delineation} you had open.`}
    />
  );
}
