/**
 * Cover art for Come, Follow Me lessons, keyed by the week's Monday (YYYY-MM-DD). Client-safe: metadata only.
 *
 * Image policy (see public/cfm/covers/README.md): a cover that depicts the Savior must be historical
 * artwork by a human artist, public domain or appropriately licensed, with its artist and source credited
 * wherever it is shown. Never generate or AI-edit such a depiction. Generated covers show landscapes or
 * objects only, with no people or divine figures.
 *
 * To give a new week its own cover, add its asset under public/cfm/covers (or public/cfm/art) and an entry
 * below. Any week without an entry uses FALLBACK_COVER.
 */

type CoverBase = {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** CSS object-position for cropping into the card's frame, e.g. "50% 20%". Defaults to centered. */
  focus?: string;
};

/** A historical work by a human artist; every field is shown with the image. */
export type PaintingCover = CoverBase & {
  kind: "painting";
  credit: {
    title: string;
    artist: string;
    date: string;
    /** Holding collection, when known. */
    collection?: string;
    license: string;
    sourceLabel: string;
    sourceUrl: string;
  };
};

/** A generated landscape or still life. Never a person or a divine figure. */
export type GeneratedCover = CoverBase & { kind: "generated" };

export type LessonCover = PaintingCover | GeneratedCover;

const GENERATED_SIZE = { width: 1536, height: 1024 } as const;

export const FALLBACK_COVER: GeneratedCover = {
  kind: "generated",
  src: "/cfm/covers/scripture-landscape.webp",
  ...GENERATED_SIZE,
  alt: "A footpath winds between olive trees on sunlit terraced hills, with pale mountains in the distance.",
};

const LESSON_COVERS: Readonly<Record<string, LessonCover>> = {
  "2026-10-26": {
    kind: "painting",
    src: "/cfm/covers/rembrandt-jeremiah.webp",
    width: 1180,
    height: 1500,
    focus: "50% 38%",
    alt: "Jeremiah rests his head on his hand as Jerusalem burns in the distance, in Rembrandt’s painting.",
    credit: {
      title: "Jeremiah Lamenting the Destruction of Jerusalem",
      artist: "Rembrandt van Rijn",
      date: "1630",
      collection: "Rijksmuseum",
      license: "Public domain",
      sourceLabel: "Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Rembrandt_-_Jeremiah_lamenting.jpg",
    },
  },
  "2026-10-19": {
    kind: "generated",
    src: "/cfm/covers/jeremiah-potter.webp",
    ...GENERATED_SIZE,
    alt: "A half-formed clay vessel on an ancient potter’s wheel in a quiet workshop, lit through a stone doorway.",
  },
  "2026-10-12": {
    kind: "generated",
    src: "/cfm/covers/zion-dawn.webp",
    ...GENERATED_SIZE,
    alt: "Limestone rooftops and stone walls of ancient Jerusalem across rolling hills at dawn, an olive tree in front.",
  },
  "2026-10-05": {
    kind: "painting",
    src: "/cfm/art/bloch-gethsemane.webp",
    width: 640,
    height: 896,
    focus: "50% 52%",
    alt: "An angel comforts Jesus as He kneels in Gethsemane, in a painting by Carl Bloch.",
    credit: {
      title: "Christ in Gethsemane",
      artist: "Carl Bloch",
      date: "1873",
      license: "Public domain",
      sourceLabel: "Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Carl_Heinrich_Bloch_-_Gethsemane.jpg",
    },
  },
  "2026-09-28": {
    kind: "painting",
    src: "/cfm/art/tissot-good-shepherd.webp",
    width: 382,
    height: 713,
    focus: "50% 12%",
    alt: "Jesus carries a sheep on His shoulders along a rocky path, in James Tissot’s The Good Shepherd.",
    credit: {
      title: "The Good Shepherd",
      artist: "James Tissot",
      date: "1886–1894",
      collection: "Brooklyn Museum",
      license: "Public domain",
      sourceLabel: "Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Brooklyn_Museum_-_The_Good_Shepherd_(Le_bon_pasteur)_-_James_Tissot_-_overall.jpg",
    },
  },
};

/** The week's own cover, or the fallback landscape. */
export function getLessonCover(weekStart: string): LessonCover {
  return LESSON_COVERS[weekStart] ?? FALLBACK_COVER;
}

/** Week starts that have their own cover (for tests and audits). */
export function lessonCoverWeeks(): string[] {
  return Object.keys(LESSON_COVERS);
}

/** "Carl Bloch, Christ in Gethsemane" for compact card captions; null for generated covers. */
export function shortCoverCredit(cover: LessonCover): string | null {
  return cover.kind === "painting" ? `${cover.credit.artist}, ${cover.credit.title}` : null;
}
