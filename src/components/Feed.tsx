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
    return <div className="mx-auto max-w-3xl text-[color:var(--foreground-muted)]">Loading insights…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="panel-card mx-auto max-w-3xl rounded-[1.5rem] p-5 text-[color:var(--foreground-muted)]">
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
  const { user, promptSignIn } = useAuth();
  const { appendScriptureBlock, openBuilder } = useInsightBuilder();
  const byline = useMemo(() => {
    if (row.author_name) return row.author_name;
    return `User ${row.user_id.slice(0, 6)}`;
  }, [row.author_name, row.user_id]);

  return (
    <article className="panel-card-strong rounded-[1.4rem] p-4 space-y-3 sm:p-5">
      <header className="flex items-center justify-between">
        <h3 className="font-medium">{row.title}</h3>
        <div className="pill-tag px-2.5 py-1 text-[11px]">{new Date(row.published_at).toLocaleDateString()}</div>
      </header>
      <div className="text-xs text-[color:var(--foreground-soft)]">By {byline}</div>
      {row.summary ? (
        <p className="text-sm whitespace-pre-wrap text-[color:var(--foreground-muted)]">{row.summary}</p>
      ) : null}
      {row.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {row.tags.map((tag) => (
              <span
                key={`${row.id}-${tag}`}
                className="pill-tag px-2 py-0.5 text-[11px]"
              >
                #{tag}
              </span>
          ))}
        </div>
      ) : null}
      <ul className="space-y-2">
        {row.blocks.map((block) => (
          <li key={block.id} className="panel-card-soft rounded-[1rem] p-3">
            {block.type === "scripture" ? (
              <div className="space-y-2">
                <button
                  onClick={async () => {
                    if (!block.scripture_ref) return;
                    if (!user) {
                      void promptSignIn();
                      return;
                    }
                    await appendScriptureBlock({
                      ...block.scripture_ref,
                      text: block.text ?? null,
                    });
                    openBuilder();
                  }}
                  className="surface-button w-full rounded-[0.95rem] border px-3 py-2 text-left"
                >
                  <div className="text-xs font-medium uppercase tracking-wide text-[color:var(--foreground-soft)]">Scripture</div>
                  <div className="text-sm font-medium">{block.scripture_ref?.reference ?? "Unknown reference"}</div>
                  {block.text ? (
                    <div className="mt-1 whitespace-pre-wrap text-sm text-[color:var(--foreground-muted)]">
                      {renderTextWithHighlights(block.text, block.highlight_word_indices ?? [])}
                    </div>
                  ) : null}
                </button>
              </div>
            ) : null}
            {block.type === "text" ? (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--foreground-soft)]">Text</div>
                <p className="text-sm whitespace-pre-wrap">{block.text}</p>
              </div>
            ) : null}
            {block.type === "quote" ? (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--foreground-soft)]">Quote</div>
                <blockquote className="border-l-2 border-black/20 pl-3 text-sm whitespace-pre-wrap dark:border-white/25">
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
                    <div className="text-xs text-[color:var(--foreground-soft)]">
                      {block.dictionary_meta?.edition === "ETY"
                        ? "Etymology"
                        : `${block.dictionary_meta?.edition ?? "Webster"} Webster`}
                      {block.dictionary_meta?.pronounce ? ` - ${block.dictionary_meta.pronounce}` : ""}
                    </div>
                  </div>
                  <span className="pill-tag shrink-0 px-2 py-0.5 text-[10px]">
                    {block.dictionary_meta?.edition === "ETY" ? "Etymology" : "Dictionary"}
                  </span>
                </div>
                {block.dictionary_meta?.heading ? (
                  <div className="text-[11px] uppercase tracking-wide text-[color:var(--foreground-soft)]">{block.dictionary_meta.heading}</div>
                ) : null}
                <div className="panel-card-soft rounded-[0.9rem] p-2">
                  <DictionaryEntryBody entryText={block.text ?? ""} />
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="text-xs text-[color:var(--foreground-soft)]">{row.block_count} blocks</div>
    </article>
  );
}
