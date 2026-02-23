"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getBookAbbreviation } from "@/lib/scriptureQuickNav";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";

export type Crumb = { label: string; href?: string };

const VOLUME_ABBREVIATIONS: Record<string, string> = {
  bookofmormon: "BoM",
  oldtestament: "OT",
  newtestament: "NT",
  doctrineandcovenants: "D&C",
  pearl: "PGP",
};

const VOLUME_LABEL_TO_KEY: Record<string, string> = {
  "book of mormon": "bookofmormon",
  "old testament": "oldtestament",
  "new testament": "newtestament",
  "doctrine and covenants": "doctrineandcovenants",
  "pearl of great price": "pearl",
};

function getMobileScoreLimit(viewportWidth: number): number {
  if (viewportWidth > 416) return 999;
  if (viewportWidth >= 390) return 84;
  if (viewportWidth >= 375) return 72;
  if (viewportWidth >= 360) return 62;
  if (viewportWidth >= 345) return 52;
  return 42;
}

function getMobileMinStage(viewportWidth: number): number {
  if (viewportWidth <= 336) return 3;
  if (viewportWidth <= 399) return 2;
  if (viewportWidth <= 416) return 1;
  return 0;
}

function parseBrowseHref(href?: string): { volume?: string; book?: string; chapter?: string } | null {
  if (!href) return null;
  try {
    const url = new URL(href, "https://verse-together.local");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "browse") return null;
    return { volume: parts[1], book: parts[2], chapter: parts[3] };
  } catch {
    return null;
  }
}

function toCompactLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length <= 8) return trimmed;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const initials = words.map((word) => word[0]?.toUpperCase() ?? "").join("");
    if (initials.length >= 2 && initials.length <= 5) return initials;
  }
  return `${trimmed.slice(0, 7)}.`;
}

function getVolumeAbbreviation(item: Crumb): string | null {
  const parsed = parseBrowseHref(item.href);
  if (parsed?.volume && !parsed.book) {
    const canonical = normalizeScriptureVolume(parsed.volume);
    return VOLUME_ABBREVIATIONS[canonical] ?? null;
  }
  const fromLabel = VOLUME_LABEL_TO_KEY[item.label.trim().toLowerCase()];
  if (!fromLabel) return null;
  return VOLUME_ABBREVIATIONS[fromLabel] ?? null;
}

function getBookCrumbAbbreviation(item: Crumb): string | null {
  const parsed = parseBrowseHref(item.href);
  if (!parsed?.book) return null;
  return getBookAbbreviation(parsed.book);
}

function getChapterAbbreviation(item: Crumb, index: number, allItems: Crumb[]): string | null {
  const parsed = parseBrowseHref(item.href);
  if (parsed?.chapter && /^\d+$/.test(parsed.chapter)) return parsed.chapter;

  const chapterMatch = item.label.match(/^chapter\s+(\d+)$/i);
  if (chapterMatch?.[1]) return chapterMatch[1];

  // For terminal reference labels like "1 Nephi 1" or "John 3"
  if (index !== allItems.length - 1) return null;
  const trailingChapter = item.label.match(/(\d+)(?::\d+(?:-\d+)?)?$/)?.[1];
  if (!trailingChapter) return null;
  return trailingChapter;
}

function scoreLabels(labels: string[]): number {
  const body = labels.reduce((sum, label) => sum + label.length, 0);
  const separators = Math.max(0, labels.length - 1) * 3;
  return body + separators;
}

function buildMobileLabels(items: Crumb[], mobileScoreLimit: number, minStage: number): string[] {
  const fullLabels = items.map((item) => item.label);
  const chapterStage = [...fullLabels];

  // 1) Abbreviate chapter label to number.
  items.forEach((item, index) => {
    const chapterAbbr = getChapterAbbreviation(item, index, items);
    if (!chapterAbbr) return;
    chapterStage[index] = chapterAbbr;
  });

  const workStage = [...chapterStage];

  // 2) Abbreviate work label.
  items.forEach((item, index) => {
    const workAbbr = getVolumeAbbreviation(item);
    if (!workAbbr) return;
    workStage[index] = workAbbr;
  });

  const bookStage = [...workStage];

  // 3) Abbreviate book label.
  items.forEach((item, index) => {
    const bookAbbr = getBookCrumbAbbreviation(item);
    if (bookAbbr) {
      bookStage[index] = bookAbbr;
      return;
    }
    const parsed = parseBrowseHref(item.href);
    if (parsed?.book) {
      bookStage[index] = toCompactLabel(bookStage[index]);
    }
  });

  const stages = [fullLabels, chapterStage, workStage, bookStage];
  const start = Math.max(0, Math.min(stages.length - 1, minStage));
  for (let index = start; index < stages.length; index += 1) {
    const stage = stages[index];
    if (scoreLabels(stage) <= mobileScoreLimit) return stage;
  }
  return bookStage;
}

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (!items?.length) return null;
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [mobileScoreLimit, setMobileScoreLimit] = useState(999);
  const [mobileMinStage, setMobileMinStage] = useState(0);

  useEffect(() => {
    function syncMobileScoreLimit() {
      const width = window.innerWidth;
      setMobileScoreLimit(getMobileScoreLimit(width));
      setMobileMinStage(getMobileMinStage(width));
    }
    syncMobileScoreLimit();
    window.addEventListener("resize", syncMobileScoreLimit);
    return () => window.removeEventListener("resize", syncMobileScoreLimit);
  }, []);

  const { mobileItems, hasMobileAbbreviations } = useMemo(() => {
    const labels = buildMobileLabels(items, mobileScoreLimit, mobileMinStage);
    const nextMobileItems = items.map((item, index) => ({
      ...item,
      mobileLabel: labels[index] ?? item.label,
    }));
    const abbreviated = nextMobileItems.some((item) => item.mobileLabel !== item.label);
    return { mobileItems: nextMobileItems, hasMobileAbbreviations: abbreviated };
  }, [items, mobileScoreLimit, mobileMinStage]);

  useEffect(() => {
    if (!hasMobileAbbreviations) setMobileExpanded(false);
  }, [hasMobileAbbreviations]);

  return (
    <nav aria-label="Breadcrumb" className="relative text-xs sm:text-sm text-foreground/70 min-w-0 max-w-full">
      <div className="sm:hidden relative min-w-0">
        <ol
          className={`flex items-center gap-1 min-w-0 max-w-full overflow-x-auto whitespace-nowrap ${
            hasMobileAbbreviations ? "pr-7" : "pr-0"
          }`}
        >
          {mobileItems.map((item, index) => (
            <li key={`m-${index}`} className="inline-flex items-center gap-1 shrink-0">
              {item.href ? (
                <Link
                  href={item.href}
                  className="rounded px-1 py-0.5 text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => setMobileExpanded(false)}
                  title={item.label}
                >
                  {item.mobileLabel}
                </Link>
              ) : (
                <span className="px-1 py-0.5 text-foreground" title={item.label}>
                  {item.mobileLabel}
                </span>
              )}
              {index < mobileItems.length - 1 ? (
                <span className="text-foreground/40">/</span>
              ) : null}
            </li>
          ))}
        </ol>
        {hasMobileAbbreviations ? (
          <button
            type="button"
            className="absolute right-0 top-1/2 -translate-y-1/2 rounded px-1 py-0.5 text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
            aria-expanded={mobileExpanded}
            aria-label={mobileExpanded ? "Collapse full breadcrumb" : "Expand full breadcrumb"}
            onClick={() => setMobileExpanded((prev) => !prev)}
          >
            {mobileExpanded ? "▴" : "▾"}
          </button>
        ) : null}
        {mobileExpanded && hasMobileAbbreviations ? (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-30 w-[min(88vw,32rem)] rounded-md border surface-card p-2 shadow-lg backdrop-blur">
            <ol className="flex flex-wrap items-center justify-center gap-2">
              {items.map((c, idx) => (
                <li key={`mobile-full-${idx}`} className="flex items-center gap-2">
                  {c.href ? (
                    <Link
                      href={c.href}
                      className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                      onClick={() => setMobileExpanded(false)}
                    >
                      {c.label}
                    </Link>
                  ) : (
                    <span className="text-foreground">{c.label}</span>
                  )}
                  {idx < items.length - 1 ? (
                    <span className="text-foreground/40">/</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      <ol className="hidden sm:flex flex-wrap items-center gap-2">
        {items.map((c, idx) => (
          <li key={idx} className="flex items-center gap-2">
            {c.href ? (
              <Link
                href={c.href}
                className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                {c.label}
              </Link>
            ) : (
              <span className="text-foreground">{c.label}</span>
            )}
            {idx < items.length - 1 ? (
              <span className="text-foreground/40">/</span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
