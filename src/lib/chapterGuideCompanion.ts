import type { RangeChapter } from "./cfm/cfmAnchors.ts";
import { rangeKey, scriptureAnchor } from "./cfm/cfmAnchors.ts";
import { type GuideContextBlock, type GuidePassage, type GuideReaderSection, safeHref, type TocItem, type TocVerse } from "./cfm/cfmGuide.ts";
import { escapeHtml, findBookBySlug, linkifyText, scripturePassage, scriptureLink } from "./cfm/cfmScriptures.mjs";
import {
  CHAPTER_GUIDE_LABEL,
  chapterGuideHref,
  type ChapterGuidePassageView,
  type ChapterGuideResource,
  type ChapterGuideSelectionState,
  type ChapterGuideState,
  type ChapterGuideView,
  OPEN_CHAPTER_GUIDE_LABEL,
  passageIncludesVerse,
} from "./chapterGuideView.ts";

export type ChapterGuideLocation = { volume: string; book: string; chapter: number };

export type ChapterGuideCompanion = {
  chapter: RangeChapter;
  subtitle: string;
  introductionHtml: string;
  readerSections: GuideReaderSection[];
  closingHtml: string;
  toc: TocItem[];
};

const AI_DISCLAIMER_OPENING = /^(?:Note:\s*)?This (?:is an?|guide is) AI[- ]generated(?: study| chapter)?(?: guide)?\.\s*/i;
const APPLICATION_PREFIX = /^Application:\s*/i;

function readingOrder(guide: ChapterGuideView): ChapterGuidePassageView[] {
  return [...guide.passages].sort((left, right) => left.verse_start - right.verse_start);
}

function bookName(location: ChapterGuideLocation): string {
  return findBookBySlug(location.book)?.name ?? location.book;
}

function verseSpan(first: number, last: number): string {
  return first === last ? `${first}` : `${first}–${last}`;
}

function verseReference(book: string, chapter: number, first: number, last: number): string {
  return `${book} ${chapter}:${verseSpan(first, last)}`;
}

function passageAnchor(passage: { verse_start: number; verse_end: number }): string {
  return `passage-${passage.verse_start}-${passage.verse_end}`;
}

function prose(text: string, book: string): string {
  return linkifyText(text, book);
}

function paragraphs(items: readonly string[], book: string): string {
  return items.map((item) => `<p>${prose(item, book)}</p>\n`).join("");
}

function leadHeading(label: string): string {
  return `<p class="cfm-lead"><strong>${label}</strong></p>\n`;
}

function applicationHtml(passage: ChapterGuidePassageView, book: string): string {
  return passage.latter_day_saint_application
    .map((item) => `<p class="cfm-lead"><strong>Application.</strong> ${prose(item.replace(APPLICATION_PREFIX, ""), book)}</p>\n`)
    .join("");
}

function crossReferencesHtml(passage: ChapterGuidePassageView, book: string): string {
  if (passage.cross_references.length === 0) return "";
  const items = passage.cross_references.map((item) => {
    const label = escapeHtml(item.reference);
    const link = item.href ? scriptureLink({ href: item.href, last: item.rangeEnd ?? undefined }, label) : label;
    return `<li>${link}${item.note ? ` — ${prose(item.note, book)}` : ""}</li>`;
  });
  return `${leadHeading("Cross-references.")}<ul>${items.join("")}</ul>\n`;
}

function questionsHtml(passage: ChapterGuidePassageView, book: string): string {
  if (passage.questions.length === 0) return "";
  return `${leadHeading("Questions to study.")}<ul>${passage.questions.map((item) => `<li>${prose(item, book)}</li>`).join("")}</ul>\n`;
}

function citedSources(guide: ChapterGuideView, ids: readonly string[]): Array<{ title: string; url: string }> {
  return ids.flatMap((id) => {
    const source = guide.sources.find((item) => item.id === id);
    return source && safeHref(source.url) ? [{ title: source.title, url: source.url }] : [];
  });
}

function sourceLink(source: { title: string; url: string }): string {
  return `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a>`;
}

function sourcesPanel(guide: ChapterGuideView, ids: readonly string[], scripture: { label: string; link: { href: string; last?: number } | null } | null): string {
  const cited = citedSources(guide, ids);
  if (!scripture?.link && cited.length === 0) return "";
  const primary = scripture?.link ? `<li>${scriptureLink(scripture.link, escapeHtml(scripture.label))} <span>(scripture text)</span></li>` : "";
  const items = cited.map((source) => `<li>${sourceLink(source)}</li>`).join("");
  const note = cited.length === 0 ? "<p>Commentary is the guide's interpretation.</p>" : "";
  return `<details class="cfm-sources" data-cfm-added="sources"><summary>Sources</summary><ul>${primary}${items}</ul>${note}</details>\n`;
}

function passageBody(passage: ChapterGuidePassageView, book: string): { first: string; rest: string } {
  return {
    first: paragraphs(passage.original_meaning.slice(0, 1), book),
    rest:
      paragraphs(passage.original_meaning.slice(1), book) +
      applicationHtml(passage, book) +
      crossReferencesHtml(passage, book) +
      questionsHtml(passage, book),
  };
}

function passageBlock(guide: ChapterGuideView, passage: ChapterGuidePassageView, chapter: RangeChapter): GuideContextBlock {
  const id = passageAnchor(passage);
  const first = passage.verse_start;
  const last = passage.verse_end;
  const label = `${chapter.chapter}:${verseSpan(first, last)}`;
  const reference = `${chapter.book} ${label}`;
  const local = `#${scriptureAnchor(chapter.slug, chapter.chapter, first, last)}`;
  const heading =
    `<h3 id="${id}" class="cfm-h-verse" data-cfm-passage data-chapter="${chapter.key}" data-first="${first}" data-last="${last}">` +
    `<span class="cfm-vref"><a class="cfm-scripture cfm-local" data-cfm-local href="${local}" data-chapter="${chapter.key}" data-first="${first}" data-last="${last}">${escapeHtml(reference)}</a></span>` +
    `<span class="cfm-sr"> — </span><span class="cfm-vtitle">${escapeHtml(passage.heading)}</span></h3>\n`;
  const body = passageBody(passage, chapter.book);
  const panel = sourcesPanel(guide, passage.source_ids, {
    label: reference,
    link: scripturePassage(chapter.book, chapter.chapter, first, last),
  });
  const preview = heading + body.first;
  const scoped: GuidePassage = { id, label, chapter: chapter.key, first, last };
  return { id, html: preview + body.rest + panel, passage: scoped, previewEnd: (body.rest + panel).trim() ? preview.length : undefined };
}

function section(id: string, heading: string, kind: TocItem["kind"], body: string): string {
  return `<section class="cfm-section" data-kind="${kind}" aria-labelledby="${id}">\n<h2 id="${id}">${escapeHtml(heading)}</h2>\n${body}</section>\n`;
}

export function withoutAiDisclaimer(paragraph: string): string {
  return paragraph.replace(AI_DISCLAIMER_OPENING, "");
}

export function guideSubtitle(title: string, reference: string): string {
  const prefix = `${reference}:`;
  return title.startsWith(prefix) ? title.slice(prefix.length).trim() : title;
}

export function chapterGuideCompanion(guide: ChapterGuideView, location: ChapterGuideLocation): ChapterGuideCompanion {
  const book = bookName(location);
  const chapter: RangeChapter = {
    key: rangeKey(0, location.chapter),
    book,
    slug: location.book,
    volume: location.volume,
    chapter: location.chapter,
  };
  const passages = readingOrder(guide);
  const blocks = passages.map((passage) => passageBlock(guide, passage, chapter));
  const chapterId = `${location.book}-${location.chapter}`;
  const local = `#${scriptureAnchor(location.book, location.chapter)}`;
  const reader: GuideReaderSection = {
    id: chapterId,
    chapter: chapter.key,
    headingHtml:
      `<h2 id="${chapterId}" class="cfm-h-chapter"><a class="cfm-scripture cfm-local" data-cfm-local href="${local}" data-chapter="${chapter.key}">` +
      `<span class="cfm-ch-book">${escapeHtml(book)}</span> <span class="cfm-ch-num">${location.chapter}</span></a></h2>\n`,
    blocks,
  };

  const overview = guide.overview.map(withoutAiDisclaimer).filter(Boolean);
  const historicalPanel = sourcesPanel(guide, guide.historical_context.source_ids, null);
  const introductionHtml =
    section("overview", "Overview", "section", paragraphs(overview, book)) +
    section("historical-context", "Historical context", "section", paragraphs(guide.historical_context.paragraphs, book) + historicalPanel);

  const insightVerses: TocVerse[] = [];
  const insights = guide.significant_insights
    .map((insight, index) => {
      const id = `insight-${index + 1}`;
      const label = verseReference(book, location.chapter, insight.verse_start, insight.verse_end);
      insightVerses.push({ id, ref: label, short: `${location.chapter}:${verseSpan(insight.verse_start, insight.verse_end)}`, text: insight.title });
      const anchor = `#${scriptureAnchor(location.book, location.chapter, insight.verse_start, insight.verse_end)}`;
      return (
        `<h3 id="${id}" class="cfm-h-verse"><span class="cfm-vref"><a class="cfm-scripture cfm-local" data-cfm-local href="${anchor}" data-chapter="${chapter.key}" data-first="${insight.verse_start}" data-last="${insight.verse_end}">${escapeHtml(label)}</a></span>` +
        `<span class="cfm-sr"> — </span><span class="cfm-vtitle">${escapeHtml(insight.title)}</span></h3>\n` +
        paragraphs(insight.paragraphs, book) +
        sourcesPanel(guide, insight.source_ids, null)
      );
    })
    .join("");
  const limitations = guide.limitations.length > 0 ? `<ul>${guide.limitations.map((item) => `<li>${prose(item, book)}</li>`).join("")}</ul>\n` : "";
  const sourceItems = guide.sources.filter((source) => safeHref(source.url));
  const sourcesBody =
    "<p>An AI researcher found these pages with its own web searches. The AI writer worked from short research notes, not from the pages themselves, and no person checked them. Videos and audio weren't watched or listened to.</p>\n" +
    `<ul>${sourceItems.map((source) => `<li>${sourceLink(source)}${source.use ? ` — ${prose(source.use, book)}` : ""}</li>`).join("")}</ul>\n`;
  const closingHtml =
    (insights ? section("significant-insights", "Significant insights", "section", insights) : "") +
    (limitations ? section("limits-of-this-guide", "Limits of this guide", "section", limitations) : "") +
    (sourceItems.length > 0 ? section("research-sources", "Research sources", "sources", sourcesBody) : "");

  const tocItem = (id: string, text: string, kind: TocItem["kind"], part: TocItem["part"], verses: TocVerse[] = []): TocItem => ({ id, text, depth: 2, kind, part, verses });
  const toc: TocItem[] = [
    tocItem("overview", "Overview", "section", "introduction"),
    tocItem("historical-context", "Historical context", "section", "introduction"),
    {
      ...tocItem(
        chapterId,
        `${book} ${location.chapter}`,
        "chapter",
        "reader",
        passages.map((passage) => {
          const short = `${location.chapter}:${verseSpan(passage.verse_start, passage.verse_end)}`;
          return { id: passageAnchor(passage), ref: `${book} ${short}`, short, text: passage.heading };
        })
      ),
      book,
      number: String(location.chapter),
    },
    ...(insights ? [tocItem("significant-insights", "Significant insights", "section", "closing", insightVerses)] : []),
    ...(limitations ? [tocItem("limits-of-this-guide", "Limits of this guide", "section", "closing")] : []),
    ...(sourceItems.length > 0 ? [tocItem("research-sources", "Research sources", "sources", "closing")] : []),
  ];

  return {
    chapter,
    subtitle: guideSubtitle(guide.title, guide.reference),
    introductionHtml,
    readerSections: [reader],
    closingHtml,
    toc,
  };
}

export function chapterGuideResources(guide: ChapterGuideView, location: ChapterGuideLocation, verses: readonly number[]): ChapterGuideResource[] {
  const book = bookName(location);
  const href = chapterGuideHref(location.volume, location.book, location.chapter);
  return readingOrder(guide)
    .filter((passage) => passageIncludesVerse(passage, verses))
    .map((passage) => {
      const anchor = passageAnchor(passage);
      const body = passageBody(passage, book);
      return {
        id: `${href}#${anchor}`,
        title: passage.heading,
        reference: verseReference(book, location.chapter, passage.verse_start, passage.verse_end),
        lessonTitle: CHAPTER_GUIDE_LABEL,
        dateLabel: "",
        href: `${href}#${anchor}`,
        linkLabel: OPEN_CHAPTER_GUIDE_LABEL,
        generated: true,
        bodyHtml: body.first + body.rest,
        sources: citedSources(guide, passage.source_ids),
      };
    });
}

export function chapterGuideSelectionState(state: ChapterGuideState, location: ChapterGuideLocation, verses: readonly number[]): ChapterGuideSelectionState {
  return {
    reference: state.reference,
    href: chapterGuideHref(location.volume, location.book, location.chapter),
    hasGuide: state.guide !== null,
    resources: state.guide ? chapterGuideResources(state.guide, location, verses) : [],
    generating: state.generating,
    availability: state.availability,
    cooldown: state.cooldown ?? null,
  };
}
