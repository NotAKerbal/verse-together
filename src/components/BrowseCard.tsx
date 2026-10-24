import Image from "next/image";
import type { ReactNode } from "react";
import BrowseLink from "./BrowseLink";

export type BrowseCardImage = {
  /** Path under `public/`, e.g. `/art/browse-notes.webp`. */
  src: string;
  /** CSS `object-position` for the crop; defaults to centered. */
  objectPosition?: string;
};

type Props = {
  href: string;
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Decorative art on the card's right side, fading out to the left; the text column stays clear of it. */
  image?: BrowseCardImage;
  background?: string;
  /** Classes for the grid item, e.g. `simple-hide`. */
  className?: string;
  ariaLabel?: string;
};

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * One whole-card link in the Library grid; every card shares its size, padding, and border. Inside the browse
 * selector a volume card switches the view in place (see BrowseLink).
 */
export default function BrowseCard({ href, eyebrow, title, description, image, background, className, ariaLabel }: Props) {
  return (
    <li className={className}>
      <BrowseLink
        href={href}
        className="browse-card panel-card interactive-card group"
        style={background ? { background } : undefined}
        aria-label={ariaLabel}
        data-media={image ? "true" : undefined}
        data-tap
      >
        {image ? (
          <div className="browse-card-media" aria-hidden="true">
            <Image
              src={image.src}
              alt=""
              fill
              // A lone last card spans both tablet columns, so tablets get the phone width.
              sizes="(min-width: 1024px) 12rem, 45vw"
              className="object-cover"
              style={image.objectPosition ? { objectPosition: image.objectPosition } : undefined}
            />
          </div>
        ) : null}
        <div className="relative flex items-start justify-between gap-3">
          <span className="browse-card-text text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[color:var(--foreground-muted)]">
            {eyebrow}
          </span>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] text-[color:var(--foreground)] transition-transform duration-150 group-hover:translate-x-0.5">
            <ChevronIcon />
          </span>
        </div>
        <div className="browse-card-text relative min-w-0">
          <div className="browse-card-title font-display font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground">
            {title}
          </div>
          {description ? (
            <p className="mt-1 text-xs font-semibold text-[color:var(--foreground-muted)]">{description}</p>
          ) : null}
        </div>
      </BrowseLink>
    </li>
  );
}
