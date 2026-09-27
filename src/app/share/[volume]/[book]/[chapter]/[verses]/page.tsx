import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import ShareChrome from "@/components/ShareChrome";
import { findCatalogBook, getBookLabel, getChapterHref } from "@/features/plans/scriptureCatalog";
import { getLocalLdsChapter } from "@/lib/ldsLocalData.server";
import { formatPassageReference, groupVerseRuns, parseVerseSpec } from "@/lib/passageShare";
import { getScriptureVolumeLabel, normalizeScriptureVolume } from "@/lib/scriptureVolumes";

type Params = {
  params: Promise<{ volume: string; book: string; chapter: string; verses: string }>;
};

const DESCRIPTION_LIMIT = 200;

function typesetDashes(text: string): string {
  return text.replace(/--/g, "\u2014");
}

async function loadPassage(raw: { volume: string; book: string; chapter: string; verses: string }) {
  const volume = normalizeScriptureVolume(raw.volume);
  const book = decodeURIComponent(raw.book);
  const chapter = Number(raw.chapter);
  if (!/^\d+$/.test(raw.chapter) || !Number.isSafeInteger(chapter) || chapter < 1) return null;

  const data = await getLocalLdsChapter(volume, book, chapter);
  if (!data || data.verses.length === 0) return null;

  const maxVerse = data.verses.reduce((max, verse) => Math.max(max, verse.verse), 0);
  const verseNumbers = parseVerseSpec(decodeURIComponent(raw.verses), maxVerse);
  if (!verseNumbers) return null;

  const byNumber = new Map(data.verses.map((verse) => [verse.verse, verse]));
  const verses = verseNumbers.flatMap((number) => {
    const verse = byNumber.get(number);
    return verse ? [verse] : [];
  });
  if (verses.length === 0) return null;

  const bookLabel = findCatalogBook(volume, book)
    ? getBookLabel(volume, book)
    : data.reference.replace(/\s+\d+$/, "") || book.replace(/-/g, " ");
  const reference = formatPassageReference(bookLabel, chapter, verses.map((verse) => verse.verse));

  return {
    volume,
    book,
    chapter,
    verses,
    reference,
    bookLabel,
    volumeLabel: getScriptureVolumeLabel(volume),
    chapterHref: `${getChapterHref({ volume, book, chapter })}#v-${verses[0].verse}`,
  };
}

function truncate(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= limit) return collapsed;
  const cut = collapsed.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const passage = await loadPassage(await params);
  if (!passage) {
    return { title: "Passage not found · Verse Together" };
  }
  const title = `${passage.reference} · Verse Together`;
  const description = truncate(passage.verses.map((verse) => typesetDashes(verse.text)).join(" "), DESCRIPTION_LIMIT);
  return {
    title,
    description,
    openGraph: { title, description, type: "article", siteName: "Verse Together" },
    twitter: { card: "summary", title, description },
  };
}

export default async function SharePassagePage({ params }: Params) {
  const passage = await loadPassage(await params);
  if (!passage) notFound();

  const runs = groupVerseRuns(passage.verses.map((verse) => verse.verse));
  const versesByNumber = new Map(passage.verses.map((verse) => [verse.verse, verse]));

  return (
    <div className="share-page">
      <ShareChrome />
      <div className="share-page-inner">
        <header className="share-header">
          <p className="share-eyebrow">{passage.volumeLabel}</p>
          <h1 className="share-reference font-display">{passage.reference}</h1>
        </header>

        <article className="share-card" aria-label={passage.reference}>
          <ol className="share-passage">
            {runs.map((run, runIndex) => (
              <Fragment key={`${run.start}-${run.end}`}>
                {runIndex > 0 ? (
                  <li className="share-gap" aria-label="Verses omitted">
                    <span aria-hidden="true">{"…"}</span>
                  </li>
                ) : null}
                {Array.from({ length: run.end - run.start + 1 }, (_, offset) => run.start + offset).map((number) => {
                  const verse = versesByNumber.get(number);
                  if (!verse) return null;
                  return (
                    <li key={number} value={number} id={`v-${number}`}>
                      <sup className="share-verse-number">{number}</sup>
                      {typesetDashes(verse.text)}
                    </li>
                  );
                })}
              </Fragment>
            ))}
          </ol>
        </article>

        <footer className="share-footer">
          <Link href={passage.chapterHref} aria-label={`Read all of ${passage.bookLabel} ${passage.chapter}`}>
            Read the whole chapter
            <span aria-hidden="true">{"→"}</span>
          </Link>
          <Link href="/" className="brand-wordmark" aria-label="Verse Together home">
            Verse<span>Together</span>
          </Link>
        </footer>
      </div>
    </div>
  );
}
