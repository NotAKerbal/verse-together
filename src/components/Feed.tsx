"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { type PublishedInsight } from "@/lib/appData";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import DictionaryEntryBody from "@/components/DictionaryEntryBody";

function renderTextWithHighlights(text: string | null, highlightedWordIndices: number[]) {
  const sourceText = text ?? "";
  if (!sourceText) return null;
  const tokens = sourceText.match(/\S+\s*/g) ?? [];
  const selected = new Set(highlightedWordIndices ?? []);
  return tokens.map((token, idx) => {
    const isHighlighted = selected.has(idx);
    const prevHighlighted = selected.has(idx - 1);
    const nextHighlighted = selected.has(idx + 1);
    return (
      <span
        key={`w-${idx}`}
        className={
          isHighlighted
            ? [
                "bg-amber-300/70 dark:bg-amber-400/40",
                prevHighlighted ? "" : "rounded-l-sm",
                nextHighlighted ? "" : "rounded-r-sm",
              ].join(" ")
            : undefined
        }
      >
        {token}
      </span>
    );
  });
}

export default function Feed() {
  const rows = useQuery(api.insights.getPublishedInsightsFeed, {}) as PublishedInsight[] | undefined;

  if (rows === undefined) {
    return <div className="mx-auto max-w-3xl">Loading insights…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-3xl text-foreground/80">
        No published insights yet. Build one from any scripture and publish it when you are ready.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {rows.map((r) => (
        <InsightCard key={r.id} row={r} />
      ))}
    </div>
  );
}

function InsightCard({ row }: { row: PublishedInsight }) {
  const { user } = useAuth();
  const { appendScriptureBlock, openBuilder } = useInsightBuilder();
  const byline = useMemo(() => {
    if (row.author_name) return row.author_name;
    return `User ${row.user_id.slice(0, 6)}`;
  }, [row.author_name, row.user_id]);

  return (
    <article className="rounded-lg border border-black/10 dark:border-white/15 p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="font-medium">{row.title}</h3>
        <div className="text-xs text-foreground/60">{new Date(row.published_at).toLocaleDateString()}</div>
      </header>
      <div className="text-xs text-foreground/60">By {byline}</div>
      {row.summary ? (
        <p className="text-sm text-foreground/80 whitespace-pre-wrap">{row.summary}</p>
      ) : null}
      {row.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {row.tags.map((tag) => (
            <span
              key={`${row.id}-${tag}`}
              className="rounded-full border border-black/10 dark:border-white/15 px-2 py-0.5 text-[11px] text-foreground/70"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
      <ul className="space-y-2">
        {row.blocks.map((block) => (
          <li key={block.id} className="rounded-md border border-black/5 dark:border-white/10 p-3">
            {block.type === "scripture" ? (
              <div className="space-y-2">
                <button
                  onClick={async () => {
                    if (!block.scripture_ref) return;
                    if (!user) {
                      alert("Please sign in to build insights.");
                      return;
                    }
                    await appendScriptureBlock({
                      ...block.scripture_ref,
                      text: block.text ?? null,
                    });
                    openBuilder();
                  }}
                  className="text-left w-full rounded-md border border-black/10 dark:border-white/15 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <div className="text-xs font-medium text-foreground/70 uppercase tracking-wide">Scripture</div>
                  <div className="text-sm font-medium">{block.scripture_ref?.reference ?? "Unknown reference"}</div>
                  {block.text ? (
                    <div className="text-sm text-foreground/80 mt-1 whitespace-pre-wrap">
                      {renderTextWithHighlights(block.text, block.highlight_word_indices ?? [])}
                    </div>
                  ) : null}
                </button>
              </div>
            ) : null}
            {block.type === "text" ? (
              <div>
                <div className="text-xs font-medium text-foreground/70 uppercase tracking-wide mb-1">Text</div>
                <p className="text-sm whitespace-pre-wrap">{block.text}</p>
              </div>
            ) : null}
            {block.type === "quote" ? (
              <div>
                <div className="text-xs font-medium text-foreground/70 uppercase tracking-wide mb-1">Quote</div>
                <blockquote className="text-sm whitespace-pre-wrap border-l-2 border-black/20 dark:border-white/25 pl-3">
                  {renderTextWithHighlights(block.text, block.highlight_word_indices ?? [])}
                </blockquote>
                {block.link_url ? (
                  <a
                    href={block.link_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-sky-700 dark:text-sky-300 hover:underline mt-1 inline-block"
                  >
                    Source
                  </a>
                ) : null}
              </div>
            ) : null}
            {block.type === "dictionary" ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{block.dictionary_meta?.word ?? "Dictionary entry"}</div>
                    <div className="text-xs text-foreground/60">
                      {block.dictionary_meta?.edition ?? "Webster"} Webster
                      {block.dictionary_meta?.pronounce ? ` - ${block.dictionary_meta.pronounce}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-black/10 dark:border-white/15 px-2 py-0.5 text-[10px] text-foreground/70">
                    Dictionary
                  </span>
                </div>
                {block.dictionary_meta?.heading ? (
                  <div className="text-[11px] uppercase tracking-wide text-foreground/60">{block.dictionary_meta.heading}</div>
                ) : null}
                <div className="rounded-md border border-black/10 dark:border-white/15 p-2">
                  <DictionaryEntryBody entryText={block.text ?? ""} />
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="text-xs text-foreground/60">{row.block_count} blocks</div>
    </article>
  );
}
