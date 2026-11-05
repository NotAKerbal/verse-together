import type {
  ChapterGuideContent,
  GuideCrossReference,
  GuidePassage,
  PublishedGuideSource,
} from "../../convex/chapterGuideContent";
import { chapterHref, passageTarget } from "../features/comeFollowMe/passagePreview.ts";
import { findChurchBook } from "./cfm/cfmScriptures.mjs";
import { normalizeScriptureVolume, toScriptureVolumeUrlSlug } from "./scriptureVolumes.ts";

export type ChapterGuideAvailability =
  | "available"
  | "paused"
  | "not_configured"
  | "budget_exhausted"
  | "cooldown"
  | "busy"
  | "user_limit"
  | "daily_limit"
  | "needs_review";

export type ChapterGuideCrossReferenceView = GuideCrossReference & { href: string | null; rangeEnd: string | null };
export type ChapterGuidePassageView = Omit<GuidePassage, "cross_references"> & {
  cross_references: ChapterGuideCrossReferenceView[];
};
export type ChapterGuideProvenanceView = {
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
export type ChapterGuideView = Omit<ChapterGuideContent, "passages"> & {
  reference: string;
  passages: ChapterGuidePassageView[];
  sources: PublishedGuideSource[];
  provenance: ChapterGuideProvenanceView;
  generatedAt: number;
};

export type ChapterGuideGenerating = { stage: string; startedAt: number; correctionRound?: number; maxCorrectionRounds?: number };
export type ChapterGuideCooldown = { retryAt: number; failedStage: string };

export type ChapterGuideState = {
  reference: string;
  guide: ChapterGuideView | null;
  generating: ChapterGuideGenerating | null;
  availability: ChapterGuideAvailability | null;
  cooldown?: ChapterGuideCooldown | null;
};

export type ChapterGuideResource = {
  id: string;
  title: string;
  reference: string;
  lessonTitle: string;
  dateLabel: string;
  href: string;
  linkLabel: string;
  generated: true;
  bodyHtml: string;
  sources: Array<{ title: string; url: string }>;
};

export type ChapterGuideSelectionState = {
  reference: string;
  href: string;
  hasGuide: boolean;
  resources: ChapterGuideResource[];
  generating: ChapterGuideGenerating | null;
  availability: ChapterGuideAvailability | null;
  cooldown?: ChapterGuideCooldown | null;
};

export const CHAPTER_GUIDE_LABEL = "Chapter guide";
export const OPEN_CHAPTER_GUIDE_LABEL = "Open chapter guide";

export const CHAPTER_GUIDE_UNAVAILABLE_MESSAGES: Record<Exclude<ChapterGuideAvailability, "available">, string> = {
  paused: "New chapter guides are paused right now.",
  not_configured: "Chapter guides aren’t set up yet.",
  budget_exhausted: "This month’s chapter guide budget has been used. Guides that already exist can still be read.",
  cooldown: "A recent attempt at this guide didn’t finish. It can be requested again later.",
  busy: "Other chapter guides are being written. Try again in a few minutes.",
  user_limit: "You’ve reached your limit for new chapter guides for now. Guides that already exist can still be read.",
  daily_limit: "Today’s new chapter guides have all been requested. Try again tomorrow.",
  needs_review: "This one needs a little additional human review. You can keep reading the chapter and its other resources.",
};

const REQUIRED_STEPS = [
  { stage: "research", label: "Research", activity: "Researching the chapter", failure: "research" },
  { stage: "write", label: "Writing", activity: "Writing the guide", failure: "writing" },
  { stage: "review", label: "Review", activity: "Reviewing the draft", failure: "review" },
];
const CORRECTION_STAGES = [
  { stage: "repair", failure: "corrections" },
  { stage: "recheck", failure: "the review of its corrections" },
];
const REVIEW_ORDINALS = ["Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh"];

function correctionSteps(round: number, maxRounds: number) {
  const ofRounds = maxRounds > 1 ? ` (round ${round} of ${maxRounds})` : "";
  return [
    {
      stage: "repair",
      label: round === 1 ? "Corrections" : `Corrections, round ${round}`,
      activity: `Making the corrections from the review${ofRounds}`,
    },
    {
      stage: "recheck",
      label: `${REVIEW_ORDINALS[round - 1] ?? "Next"} review`,
      activity: `Reviewing the corrections${ofRounds}`,
    },
  ];
}

export type ChapterGuideProgressStep = { key: string; stage: string; label: string; status: "done" | "current" | "upcoming" };
export type ChapterGuideProgress = {
  steps: ChapterGuideProgressStep[];
  completedSteps: number;
  stepNumber: number;
  activity: string;
  correctionsMayFollow: boolean;
};

export function chapterGuideProgress(stage: string, rounds: { correctionRound?: number; maxCorrectionRounds?: number } = {}): ChapterGuideProgress | null {
  const inCorrections = CORRECTION_STAGES.some((step) => step.stage === stage);
  const round = inCorrections ? Math.max(1, rounds.correctionRound ?? 1) : 0;
  const maxRounds = Math.max(round, rounds.maxCorrectionRounds ?? 1);
  const steps: Array<{ stage: string; label: string; activity: string }> = [...REQUIRED_STEPS];
  for (let index = 1; index <= round; index += 1) steps.push(...correctionSteps(index, maxRounds));
  const currentIndex = steps.map((step) => step.stage).lastIndexOf(stage);
  if (currentIndex < 0) return null;
  return {
    steps: steps.map((step, index) => ({
      key: `${step.stage}-${index}`,
      stage: step.stage,
      label: step.label,
      status: index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming",
    })),
    completedSteps: currentIndex,
    stepNumber: currentIndex + 1,
    activity: steps[currentIndex]!.activity,
    correctionsMayFollow: round < maxRounds || !inCorrections,
  };
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function countOf(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function chapterGuideElapsedLabel(startedAt: number, now: number): string {
  const minutes = Math.floor((now - startedAt) / MINUTE_MS);
  return minutes < 1 ? "Started less than a minute ago." : `Started ${countOf(minutes, "minute")} ago.`;
}

export function chapterGuideCooldownMessage(cooldown: ChapterGuideCooldown, now: number): string {
  const failure = [...REQUIRED_STEPS, ...CORRECTION_STAGES].find((step) => step.stage === cooldown.failedStage)?.failure;
  const attempt = failure ? `The last attempt at this guide stopped during ${failure}, so nothing was saved.` : "The last attempt at this guide didn’t finish, so nothing was saved.";
  return `${attempt} To limit repeat costs, each chapter waits before another try. It can be requested again ${retryTiming(cooldown.retryAt - now)}.`;
}

function retryTiming(remaining: number): string {
  if (remaining <= 0) return "soon";
  return `in about ${remaining >= HOUR_MS ? countOf(Math.ceil(remaining / HOUR_MS), "hour") : countOf(Math.ceil(remaining / MINUTE_MS), "minute")}`;
}

export function chapterGuideConnectionMessage(reference: string, lastKnown: ChapterGuideGenerating): string {
  const activity = chapterGuideProgress(lastKnown.stage, lastKnown)?.activity;
  const lastStep = activity ? ` Last known step: ${activity}.` : "";
  return `We couldn’t check on the guide for ${reference}, so we don’t know if it’s still being written.${lastStep} We’ll keep checking while this page is open.`;
}

export function chapterGuideUnavailableMessage(
  state: { availability: ChapterGuideAvailability | null; cooldown?: ChapterGuideCooldown | null },
  now: number | null
): string | null {
  if (!state.availability || state.availability === "available") return null;
  if (state.availability === "cooldown" && state.cooldown && now !== null) return chapterGuideCooldownMessage(state.cooldown, now);
  return CHAPTER_GUIDE_UNAVAILABLE_MESSAGES[state.availability];
}

export function chapterGuideNoGuideMessage(
  state: { availability: ChapterGuideAvailability | null; cooldown?: ChapterGuideCooldown | null },
  reference: string,
  now: number | null
): string {
  return chapterGuideUnavailableMessage(state, now) ?? `There’s no chapter guide for ${reference} yet. You can request one from Resources in the reader.`;
}

export function crossReferenceView(
  reference: GuideCrossReference,
  lastVerseOfChapter: number | null
): ChapterGuideCrossReferenceView {
  const inRange =
    lastVerseOfChapter !== null &&
    reference.verse_start >= 1 &&
    reference.verse_start <= reference.verse_end &&
    reference.verse_end <= lastVerseOfChapter;
  const target = inRange
    ? passageTarget(reference.volume, reference.book, reference.chapter, reference.verse_start, reference.verse_end)
    : null;
  if (!target) return { ...reference, href: null, rangeEnd: null };
  return {
    ...reference,
    href: chapterHref(target),
    rangeEnd: reference.verse_end > reference.verse_start ? String(reference.verse_end) : null,
  };
}

export function passageIncludesVerse(passage: Pick<GuidePassage, "verse_start" | "verse_end">, verses: readonly number[]): boolean {
  return verses.some((verse) => verse >= passage.verse_start && verse <= passage.verse_end);
}

export function chapterGuideHref(volume: string, book: string, chapter: number): string {
  return `/chapter-guides/${toScriptureVolumeUrlSlug(volume)}/${book}/${chapter}`;
}

export function chapterGuideKey(volume: string, book: string, chapter: number): string {
  return `ai-guide-${normalizeScriptureVolume(volume)}-${book}-${chapter}`;
}

const MODEL_NAMES: Record<string, string> = {
  "gpt-5.6-luna": "OpenAI GPT-5.6 Luna",
  "gpt-5.6-terra": "OpenAI GPT-5.6 Terra",
  "claude-opus-5-5": "Anthropic Claude Opus 5.5",
};

export function chapterGuideModelName(model: string): string {
  return MODEL_NAMES[model] ?? "an AI model";
}

const PUBLISHERS: Array<{ domain: string; name: string }> = [
  { domain: "churchofjesuschrist.org", name: "ChurchofJesusChrist.org" },
  { domain: "lds.org", name: "LDS.org" },
  { domain: "scripturecentral.org", name: "Scripture Central" },
  { domain: "interpreterfoundation.org", name: "Interpreter Foundation" },
  { domain: "rsc.byu.edu", name: "BYU Religious Studies Center" },
  { domain: "byustudies.byu.edu", name: "BYU Studies" },
  { domain: "mi.byu.edu", name: "Maxwell Institute" },
  { domain: "josephsmithpapers.org", name: "Joseph Smith Papers" },
  { domain: "fairlatterdaysaints.org", name: "FAIR" },
  { domain: "dialoguejournal.com", name: "Dialogue" },
  { domain: "johnhiltoniii.com", name: "John Hilton III" },
];

const SCRIPTURE_AIDS: Record<string, string> = {
  gs: "Guide to the Scriptures",
  bd: "Bible Dictionary",
  tg: "Topical Guide",
};

const LOWERCASE_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);

function slugTitle(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word, index) => (index > 0 && LOWERCASE_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
}

function urlSourceLabel(url: URL, host: string): string {
  const publisher = PUBLISHERS.find(({ domain }) => host === domain || host.endsWith(`.${domain}`))?.name ?? host;
  const segments = pathSegments(url);
  const last = segments.at(-1);
  if (!last) return publisher;
  if (last.toLowerCase().endsWith(".pdf")) return `PDF ${last} (${publisher})`;
  if (segments[0] === "study" && segments[1] === "scriptures") {
    const aid = SCRIPTURE_AIDS[segments[2] ?? ""];
    if (aid && segments[3]) return `${aid}: ${slugTitle(segments[3])}`;
    const book = findChurchBook(segments[2], segments[3]);
    if (book && segments[4]) return `${book.name} ${segments[4]}`;
  }
  const named = segments[0] === "study" && segments[1] === "manual" ? segments.slice(2) : segments.slice(-1);
  return `${named.map(slugTitle).join(": ")} (${publisher})`;
}

export function chapterGuideSourceTitle(source: { title: string; url: string }): string {
  const title = source.title.trim();
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    return title;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (title && title.toLowerCase().replace(/^www\./, "") !== host) return title;
  return urlSourceLabel(url, host);
}
