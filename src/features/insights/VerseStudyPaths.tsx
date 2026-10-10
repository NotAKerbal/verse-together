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

const KIND_TINTS: Record<ChapterInsightKind, string> = {
  cross_reference: "var(--accent-sky-soft)",
  doctrinal_context: "var(--accent-mint)",
  historical_context: "var(--accent-note)",
  word_or_phrase: "var(--accent-primary)",
  textual_pattern: "var(--accent-sky-soft)",
  open_question: "var(--accent-coral)",
};

const LINK_CLASS =
  "font-semibold text-[color:var(--accent-secondary)] underline decoration-2 underline-offset-2 hover:opacity-80";

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
      <Link key={`${part}-${index}`} href={scriptureHref(link)} className={LINK_CLASS}>
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
      // A quiet hint beside the verse: ink-soft and unfilled until hovered, rubric and ringed while its path is
      // open. The icon keeps 3:1 on the paper in both themes; the outline focus ring also shows in forced colors.
      className={`simple-hide inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)] ${
        open
          ? "border-[color:var(--accent-rubric)] bg-[color:var(--surface-card-soft)] text-[color:var(--accent-rubric)] forced-colors:border-[color:Highlight]"
          : "border-transparent bg-transparent text-[color:var(--foreground-soft)] hover:bg-[color:var(--surface-button-hover)] hover:text-[color:var(--foreground)]"
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <FontAwesomeIcon icon={faLightbulb} className="h-3.5 w-3.5" />
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
        className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label="Study paths"
        className="fixed inset-y-3 right-3 z-50 flex w-[min(30rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.25rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] shadow-[var(--surface-shadow)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-[color:var(--surface-border)] bg-[color:var(--accent-note)] px-4 py-3 font-sans">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--accent-primary)] text-[#17161a]">
              <FontAwesomeIcon icon={faLightbulb} className="h-4 w-4" />
            </span>
            <div>
              <div className="font-display text-base font-extrabold tracking-[-0.02em] text-foreground">Study paths</div>
              <div className="text-xs font-semibold text-foreground/65">
                {paths.length === 1 ? "1 direction to explore" : `${paths.length} directions to explore`}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close study paths"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] text-foreground hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 font-sans text-sm leading-6">
          <div className="divide-y-2 divide-[color:var(--surface-border)]">
            {paths.map((path, index) => {
              const articleSources = path.sources.filter((source) => source.format !== "video");
              const videoSources = path.sources.filter((source) => source.format === "video");
              return (
                <section key={`${path.kind}-${path.title}-${index}`} className="py-4">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em]">
                    <span
                      className="rounded-full border-2 border-[color:var(--surface-border)] px-2 py-0.5 text-foreground"
                      style={{ background: KIND_TINTS[path.kind] }}
                    >
                      {KIND_LABELS[path.kind]}
                    </span>
                    <span className="text-foreground/55" aria-label={`Tagged verses ${path.verse_numbers.join(", ")}`}>
                      {path.verse_numbers.length === 1 ? "Verse" : "Verses"} {path.verse_numbers.join(", ")}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-[1.05rem] font-bold leading-snug tracking-[-0.02em] text-foreground">
                    {linkedScriptureText(path.title, path.scripture_links)}
                  </h3>
                  <p className="mt-1 text-foreground/85">{linkedScriptureText(path.direction, path.scripture_links)}</p>
                  <p className="mt-2 text-foreground/65">{linkedScriptureText(path.why, path.scripture_links)}</p>
                  <div className="mt-3 rounded-[0.9rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] px-3 py-2">
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/65">As you reread, notice</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground/80">
                      {path.look_for.map((item) => (
                        <li key={item}>{linkedScriptureText(item, path.scripture_links)}</li>
                      ))}
                    </ul>
                  </div>
                  {path.scripture_links.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="font-bold uppercase tracking-[0.08em] text-foreground/55">Scriptures</span>
                      {path.scripture_links.map((link) => (
                        <Link
                          key={`${link.volume}-${link.book}-${link.chapter}-${link.verse_start}-${link.verse_end}`}
                          href={scriptureHref(link)}
                          className={LINK_CLASS}
                        >
                          {link.reference}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {articleSources.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="font-bold uppercase tracking-[0.08em] text-foreground/55">Sources</span>
                      {articleSources.map((source) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className={LINK_CLASS}>
                          {source.title} <span className="font-normal text-foreground/45 no-underline">· {sourceHost(source.url)}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {videoSources.length > 0 ? (
                    <div className="mt-3 border-t-2 border-[color:var(--surface-border)] pt-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/55">Videos</div>
                      <div className="mt-1 space-y-1">
                        {videoSources.map((source) => (
                          <a
                            key={source.url}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-start gap-2 py-1 text-foreground hover:text-[color:var(--accent-secondary)]"
                          >
                            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--accent-sky-soft)] text-[#17161a]">
                              <FontAwesomeIcon icon={faPlay} className="h-2.5 w-2.5" aria-hidden="true" />
                            </span>
                            <span>
                              <span className="block font-semibold leading-5">{source.title}</span>
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
          <p className="pb-4 pt-2 text-[11px] leading-4 text-foreground/45">
            AI found these directions. Read the sources and decide what holds up.
          </p>
        </div>
      </aside>
    </>,
    document.body
  );
}
