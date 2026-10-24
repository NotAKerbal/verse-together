import type { LessonCover } from "./lessonCovers";

type Props = {
  cover: LessonCover;
  className?: string;
  /** Eager for the first, above-the-fold cover; lazy otherwise. */
  priority?: boolean;
};

/** A lesson's cover, cropped by its frame (the className) around the cover's focus point. */
export default function LessonCoverImage({ cover, className, priority = false }: Props) {
  return (
    // Static, pre-sized WebP assets under public/cfm; next/image adds nothing they need.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cover.src}
      width={cover.width}
      height={cover.height}
      alt={cover.alt}
      className={className}
      style={cover.focus ? { objectPosition: cover.focus } : undefined}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  );
}

/** Full visible credit with its source link. Never place inside another link. */
export function CoverCredit({ cover, className }: { cover: LessonCover; className?: string }) {
  if (cover.kind === "generated") {
    return <span className={className}>Illustration generated with AI.</span>;
  }
  const { title, artist, date, collection, license, sourceLabel, sourceUrl } = cover.credit;
  return (
    <span className={className}>
      <cite>{title}</cite>, {artist}, {date}.{collection ? ` ${collection}.` : ""} {license}, via{" "}
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
        {sourceLabel}
      </a>
      .
    </span>
  );
}
