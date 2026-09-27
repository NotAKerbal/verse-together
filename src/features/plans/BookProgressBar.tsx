"use client";

import ProgressBar from "./ProgressBar";
import { useVolumeProgress } from "./useReadingProgress";

type Props = {
  volume: string;
  book: string;
  chapterCount: number;
};

export default function BookProgressBar({ volume, book, chapterCount }: Props) {
  const progress = useVolumeProgress(volume);
  if (!progress || chapterCount <= 0) return null;
  const read = Math.min(chapterCount, progress.readCountByBook[book] ?? 0);

  return (
    <ProgressBar
      value={read}
      max={chapterCount}
      label={`${read} of ${chapterCount} chapters read`}
      className="simple-hide mt-2 max-w-[16rem]"
    />
  );
}
