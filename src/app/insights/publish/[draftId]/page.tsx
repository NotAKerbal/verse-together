"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { InsightVisibility } from "@/lib/appData";

export default function PublishInsightPage() {
  const params = useParams<{ draftId: string }>();
  const router = useRouter();
  const draftId = String(params?.draftId ?? "");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<InsightVisibility>("private");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const draft = useQuery(api.insights.getDraft, draftId ? ({ draftId: draftId as any }) : "skip") as
    | {
        id: string;
        title: string;
        status: "draft" | "published" | "archived";
        tags: string[];
        visibility: InsightVisibility;
        blocks: Array<{ id: string }>;
      }
    | undefined;
  const publishDraft = useMutation(api.insights.publishDraft);

  const blockCount = useMemo(() => draft?.blocks?.length ?? 0, [draft?.blocks]);

  useEffect(() => {
    if (!draft) return;
    setVisibility(draft.visibility ?? "private");
    setTags((draft.tags ?? []).map((tag) => `#${tag}`).join(", "));
  }, [draft]);

  async function onPublish() {
    if (!draftId) return;
    setLoading(true);
    setError(null);
    try {
      await publishDraft({
        draftId: draftId as any,
        title: title.trim() || undefined,
        summary: summary.trim() || undefined,
        tags: tags
          .split(",")
          .map((tag) => tag.trim().replace(/^#+/, ""))
          .filter(Boolean),
        visibility,
      });
      router.push("/feed");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to publish insight";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (draft === undefined) {
    return <div className="mx-auto max-w-2xl py-8">Loading draft…</div>;
  }

  return (
    <section className="mx-auto max-w-2xl py-8 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Publish insight</h1>
        <p className="text-sm text-foreground/70">
          Insights are personal by default. Publishing makes this insight visible in the community feed.
        </p>
      </header>

      <div className="rounded-lg border border-black/10 dark:border-white/15 p-4 space-y-3">
        <div className="text-xs text-foreground/70">Blocks in this draft: {blockCount}</div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={draft.title}
            className="w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Summary (optional)</span>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
            placeholder="Add a brief summary for the feed..."
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Tags (optional)</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={(draft.tags ?? []).map((tag) => `#${tag}`).join(", ")}
            className="w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Visibility</span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as InsightVisibility)}
            className="w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          >
            <option value="private">Private (default)</option>
            <option value="friends">Visible to friends</option>
            <option value="link">Sharable link</option>
            <option value="public">Public</option>
          </select>
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="rounded-md border border-black/10 dark:border-white/15 px-3 py-2 text-sm"
            disabled={loading}
          >
            Back
          </button>
          <button
            onClick={onPublish}
            disabled={loading || blockCount === 0}
            className="rounded-md bg-foreground text-background px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {loading ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </section>
  );
}
