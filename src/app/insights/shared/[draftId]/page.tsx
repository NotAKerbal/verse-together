"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { InsightDraftBlock } from "@/lib/appData";

function renderScriptureWithHighlights(text: string | null, highlightedWordIndices: number[]) {
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

export default function SharedDraftPage() {
  const params = useParams<{ draftId: string }>();
  const draftId = String(params?.draftId ?? "");
  const draft = useQuery(api.insights.getSharedDraft, draftId ? ({ draftId: draftId as any }) : "skip") as
    | {
        id: string;
        author_name: string | null;
        user_id: string;
        title: string;
        status: "draft" | "published" | "archived";
        visibility: "private" | "friends" | "link" | "public";
        tags: string[];
        updated_at: string;
        blocks: InsightDraftBlock[];
      }
    | undefined;

  const byline = useMemo(() => {
    if (!draft) return "";
    if (draft.author_name) return draft.author_name;
    return `User ${draft.user_id.slice(0, 6)}`;
  }, [draft]);

  if (draft === undefined) {
    return <div className="mx-auto max-w-3xl py-8">Loading insight...</div>;
  }

  return (
    <section className="mx-auto max-w-3xl py-8 space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{draft.title}</h1>
        <div className="text-sm text-foreground/70">
          By {byline} - {new Date(draft.updated_at).toLocaleDateString()}
        </div>
        {draft.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {draft.tags.map((tag) => (
              <span
                key={`${draft.id}-${tag}`}
                className="rounded-full border border-black/10 dark:border-white/15 px-2 py-0.5 text-[11px] text-foreground/70"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <ul className="space-y-2">
        {draft.blocks
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((block) => (
            <li key={block.id} className="rounded-md border border-black/10 dark:border-white/15 p-3">
              {block.type === "scripture" ? (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                    {block.scripture_ref?.reference ?? "Scripture"}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">
                    {renderScriptureWithHighlights(block.text, block.highlight_word_indices ?? [])}
                  </div>
                </div>
              ) : null}
              {block.type === "text" ? <p className="text-sm whitespace-pre-wrap">{block.text}</p> : null}
              {block.type === "quote" ? (
                <div className="space-y-1">
                  <blockquote className="text-sm whitespace-pre-wrap border-l-2 border-black/20 dark:border-white/25 pl-3">
                    {block.text}
                  </blockquote>
                  {block.link_url ? (
                    <a
                      href={block.link_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-sky-700 dark:text-sky-300 hover:underline"
                    >
                      Source
                    </a>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
      </ul>
    </section>
  );
}
