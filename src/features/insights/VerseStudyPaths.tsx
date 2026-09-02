"use client";

import { faLightbulb, faPlay, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { Fragment } from "react";
import { createPortal } from "react-dom";
import type { ChapterInsightKind, ChapterInsightScriptureLink, ChapterStudyPath } from "@/lib/chapterInsights";

const KIND_LABELS: Record<ChapterInsightKind, string> = {
  cross_reference: "Cross-reference",
  doctrinal_context: "Doctrinal context",
  historical_context: "Historical context",
  word_or_phrase: "Word or phrase",
  textual_pattern: "Textual pattern",
  open_question: "Open question",
};

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function scriptureHref(link: ChapterInsightScriptureLink) {
  return `/browse/${encodeURIComponent(link.volume)}/${encodeURIComponent(link.book)}/${link.chapter}#v-${link.verse_start}`;
}

function linkedScriptureText(text: string, links: ChapterInsightScriptureLink[]) {
  if (links.length === 0) return text;
  const normalizeReference = (value: string) => value.toLocaleLowerCase().replace(/[–—]/g, "-");
  const byReference = new Map(links.map((link) => [normalizeReference(link.reference), link]));
  const pattern = links
    .map((link) => link.reference)
    .sort((left, right) => right.length - left.length)
    .map((reference) => reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-–—]"))
    .join("|");
  if (!pattern) return text;
  return text.split(new RegExp(`(${pattern})`, "gi")).map((part, index) => {
    const link = byReference.get(normalizeReference(part));
    return link ? (
      <Link
        key={`${part}-${index}`}
        href={scriptureHref(link)}
        className="text-amber-700 underline decoration-amber-500/40 underline-offset-2 hover:decoration-amber-600 dark:text-amber-300"
      >
        {part}
      </Link>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    );
  });
}

export function VerseStudyPathMarker({
  verse,
  open,
  onToggle,
}: {
  verse: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${open ? "Hide" : "Explore"} study path for verse ${verse}`}
      aria-expanded={open}
      title="A study path is available"
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 ${
        open
          ? "bg-amber-400/20 text-amber-700 dark:text-amber-300"
          : "text-amber-600/75 hover:bg-amber-400/15 hover:text-amber-700 dark:text-amber-300/80"
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <FontAwesomeIcon icon={faLightbulb} className="h-3 w-3" />
    </button>
  );
}

export default function VerseStudyPaths({ paths, onClose }: { paths: ChapterStudyPath[]; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close study paths"
        className="fixed inset-0 z-40 bg-black/20 lg:hidden"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label="Study paths"
        className="fixed inset-y-2 right-2 z-50 flex w-[min(30rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-black/10 bg-background shadow-2xl dark:border-white/15"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-black/10 px-4 py-3 font-sans dark:border-white/10">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">Study paths</div>
            <div className="text-sm text-foreground/60">
              {paths.length === 1 ? "1 direction to explore" : `${paths.length} directions to explore`}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close study paths"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 dark:hover:bg-white/10"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 font-sans text-sm leading-6">
          <div className="divide-y divide-black/10 dark:divide-white/10">
            {paths.map((path, index) => {
              const articleSources = path.sources.filter((source) => source.format !== "video");
              const videoSources = path.sources.filter((source) => source.format === "video");
              return (
                <section key={`${path.kind}-${path.title}-${index}`} className="py-4">
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] uppercase tracking-wide text-foreground/50">
                    <span>{KIND_LABELS[path.kind]}</span>
                    <span aria-label={`Tagged verses ${path.verse_numbers.join(", ")}`}>
                      {path.verse_numbers.length === 1 ? "Verse" : "Verses"} {path.verse_numbers.join(", ")}
                    </span>
                  </div>
                  <h3 className="font-medium text-foreground">{linkedScriptureText(path.title, path.scripture_links)}</h3>
                  <p className="mt-1 text-foreground/85">{linkedScriptureText(path.direction, path.scripture_links)}</p>
                  <p className="mt-2 text-foreground/65">{linkedScriptureText(path.why, path.scripture_links)}</p>
                  <div className="mt-2 text-xs font-medium text-foreground/70">As you reread, notice:</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground/75">
                    {path.look_for.map((item) => (
                      <li key={item}>{linkedScriptureText(item, path.scripture_links)}</li>
                    ))}
                  </ul>
                  {path.scripture_links.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/60">
                      <span>Scriptures</span>
                      {path.scripture_links.map((link) => (
                        <Link
                          key={`${link.volume}-${link.book}-${link.chapter}-${link.verse_start}-${link.verse_end}`}
                          href={scriptureHref(link)}
                          className="text-amber-700 underline decoration-amber-500/40 underline-offset-2 hover:decoration-amber-600 dark:text-amber-300"
                        >
                          {link.reference}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {articleSources.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span className="text-foreground/60">Sources</span>
                      {articleSources.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-700 underline decoration-amber-500/40 underline-offset-2 hover:decoration-amber-600 dark:text-amber-300"
                        >
                          {source.title} <span className="text-foreground/45">· {sourceHost(source.url)}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {videoSources.length > 0 ? (
                    <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-foreground/55">Videos</div>
                      <div className="mt-1 space-y-1">
                        {videoSources.map((source) => (
                          <a
                            key={source.url}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-start gap-2 py-1 text-amber-700 hover:underline dark:text-amber-300"
                          >
                            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/15">
                              <FontAwesomeIcon icon={faPlay} className="h-2.5 w-2.5" aria-hidden="true" />
                            </span>
                            <span>
                              <span className="block leading-5">{source.title}</span>
                              <span className="block text-xs text-foreground/45">{sourceHost(source.url)}</span>
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
          <p className="pb-4 text-[11px] leading-4 text-foreground/45">
            AI found these directions. Read the sources and decide what holds up.
          </p>
        </div>
      </aside>
    </>,
    document.body
  );
}
