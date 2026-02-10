"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import type { InsightDraftSummary } from "@/lib/appData";

function visibilityLabel(visibility: InsightDraftSummary["visibility"]) {
  if (visibility === "friends") return "Friends";
  if (visibility === "link") return "Link";
  if (visibility === "public") return "Public";
  return "Private";
}

export default function SavedInsightsPage() {
  const rows = useQuery(api.insights.listMyDrafts, {}) as InsightDraftSummary[] | undefined;
  const { switchDraft, openBuilder } = useInsightBuilder();
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");

  const allTags = useMemo(() => {
    if (!rows) return [];
    const tags = new Set<string>();
    for (const row of rows) {
      for (const tag of row.tags ?? []) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const titleMatch = !q || row.title.toLowerCase().includes(q);
      const tagMatch =
        selectedTag === "all" ||
        (row.tags ?? []).includes(selectedTag) ||
        (!!q && (row.tags ?? []).some((tag) => tag.toLowerCase().includes(q)));
      return titleMatch && tagMatch;
    });
  }, [rows, search, selectedTag]);

  return (
    <section className="py-8 sm:py-12 space-y-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Saved insights</h1>
        <p className="mt-2 text-sm text-foreground/70">Review insights, jump back into editing, and manage sharing settings.</p>
      </div>

      <div className="mx-auto max-w-3xl space-y-3">
        <div className="rounded-lg border border-black/10 dark:border-white/15 p-3 space-y-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search insights..."
            className="w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedTag("all")}
              className={`rounded-full border px-3 py-1 text-xs ${
                selectedTag === "all"
                  ? "border-foreground text-foreground"
                  : "border-black/10 dark:border-white/15 text-foreground/75"
              }`}
            >
              All tags
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag((prev) => (prev === tag ? "all" : tag))}
                className={`rounded-full border px-3 py-1 text-xs ${
                  selectedTag === tag
                    ? "border-foreground text-foreground"
                    : "border-black/10 dark:border-white/15 text-foreground/75"
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
        {rows === undefined ? <p className="text-sm text-foreground/70">Loading saved insights...</p> : null}
        {rows !== undefined && rows.length === 0 ? (
          <p className="text-sm text-foreground/70">No saved insights yet.</p>
        ) : null}
        {rows !== undefined && rows.length > 0 && filteredRows.length === 0 ? (
          <p className="text-sm text-foreground/70">No insights match your filters.</p>
        ) : null}
        {filteredRows.map((row) => (
          <article key={row.id} className="rounded-lg border border-black/10 dark:border-white/15 p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-base font-medium">{row.title}</h2>
                <div className="text-xs text-foreground/65">{visibilityLabel(row.visibility)}</div>
              </div>
              <div className="text-xs text-foreground/60">{new Date(row.updated_at).toLocaleDateString()}</div>
            </div>
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
            <div className="flex items-center gap-2">
              {row.status === "draft" ? (
                <button
                  onClick={async () => {
                    await switchDraft(row.id);
                    openBuilder();
                  }}
                  className="rounded-md border border-black/10 dark:border-white/15 px-3 py-2 text-sm"
                >
                  Edit in builder
                </button>
              ) : null}
              <Link
                href={`/insights/shared/${row.id}`}
                className="rounded-md border border-black/10 dark:border-white/15 px-3 py-2 text-sm"
              >
                Open shared view
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
