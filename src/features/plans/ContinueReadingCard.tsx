"use client";

import BrowseCard from "@/components/BrowseCard";
import { formatChapterLabel, getChapterDelineation, getChapterHref } from "./scriptureCatalog";
import { useLastPosition } from "./useReadingProgress";

/** Renders nothing until there is a saved position, so the Library grid has no empty slot. */
export default function ContinueReadingCard({ className }: { className?: string }) {
  const position = useLastPosition();
  if (!position) return null;

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
