import { createHash } from "node:crypto";
import type { ChapterGuideContent, PublishedGuideSource } from "../../convex/chapterGuideContent";
import type { GuideAvailability } from "../../convex/chapterGuides";
import { type ChapterGuideCooldown, type ChapterGuideGenerating, chapterGuideSourceTitle, type ChapterGuideState, crossReferenceView } from "@/lib/chapterGuideView";
import { convexQuery } from "@/lib/convexHttp";
import { getLocalLdsChapter, type LocalChapterResponse } from "@/lib/ldsLocalData.server";

type StoredState = {
  guide: {
    reference: string;
    content: ChapterGuideContent;
    sources: PublishedGuideSource[];
    provenance: {
      researchModel: string;
      writerModel: string;
      reviewModel: string;
      requiredCorrections: number;
      repaired: boolean;
      correctionRounds?: number;
      ownerContinuations?: number;
      crossReferencesChecked?: number;
      crossReferencesUnchecked?: number;
    };
    generatedAt: number;
  } | null;
  generating: ChapterGuideGenerating | null;
  availability: GuideAvailability | null;
  cooldown?: ChapterGuideCooldown | null;
};

export type ChapterParams = { volume: string; book: string; chapter: number };

export function scriptureFingerprint(scripture: LocalChapterResponse) {
  const text = scripture.verses.map((verse) => `${verse.verse}. ${verse.text}`).join("\n");
  return {
    scriptureHash: createHash("sha256").update(text).digest("hex"),
    chapterBytes: Buffer.byteLength(text, "utf8"),
  };
}

async function lastVerseLookup(guide: NonNullable<StoredState["guide"]>) {
  const keys = new Map<string, { volume: string; book: string; chapter: number }>();
  for (const passage of guide.content.passages) {
    for (const reference of passage.cross_references) {
      keys.set(`${reference.volume}/${reference.book}/${reference.chapter}`, reference);
    }
  }
  const entries = await Promise.all(
    Array.from(keys, async ([key, { volume, book, chapter }]) => {
      const scripture = await getLocalLdsChapter(volume, book, chapter).catch(() => null);
      return [key, scripture?.verses.at(-1)?.verse ?? null] as const;
    })
  );
  return new Map(entries);
}

export async function readChapterGuideState(params: ChapterParams, scripture: LocalChapterResponse): Promise<ChapterGuideState> {
  const { scriptureHash, chapterBytes } = scriptureFingerprint(scripture);
  const stored = await convexQuery<StoredState>("chapterGuides:getChapterState", {
    ...params,
    scriptureHash,
    verseCount: scripture.verses.length,
    chapterBytes,
  });
  if (!stored.guide) {
    const siteCanRequest = Boolean(process.env.CHAPTER_GUIDE_SERVICE_SECRET?.trim());
    const availability = stored.availability && stored.availability !== "needs_review" && !siteCanRequest ? "not_configured" : stored.availability;
    const cooldown = availability === "cooldown" ? stored.cooldown ?? null : null;
    return { reference: scripture.reference, guide: null, generating: stored.generating, availability, cooldown };
  }
  const { content, sources, provenance, generatedAt, reference } = stored.guide;
  const lastVerses = await lastVerseLookup(stored.guide);
  return {
    reference: scripture.reference,
    generating: null,
    availability: null,
    guide: {
      ...content,
      reference,
      sources: sources.map((source) => ({ ...source, title: chapterGuideSourceTitle(source) })),
      generatedAt,
      provenance: {
        researchModel: provenance.researchModel,
        writerModel: provenance.writerModel,
        reviewModel: provenance.reviewModel,
        requiredCorrections: provenance.requiredCorrections,
        repaired: provenance.repaired,
        correctionRounds: provenance.correctionRounds,
        ...(provenance.ownerContinuations !== undefined ? { ownerContinuations: provenance.ownerContinuations } : {}),
        ...(provenance.crossReferencesChecked !== undefined ? { crossReferencesChecked: provenance.crossReferencesChecked } : {}),
        ...(provenance.crossReferencesUnchecked !== undefined ? { crossReferencesUnchecked: provenance.crossReferencesUnchecked } : {}),
      },
      passages: content.passages.map((passage) => ({
        ...passage,
        cross_references: passage.cross_references.map((item) =>
          crossReferenceView(item, lastVerses.get(`${item.volume}/${item.book}/${item.chapter}`) ?? null)
        ),
      })),
    },
  };
}
