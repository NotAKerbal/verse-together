"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CitationTalk = {
  id?: string;
  title: string;
  speaker?: string;
  year?: string;
  session?: string;
  talkUrl?: string;
  watchUrl?: string;
  listenUrl?: string;
  talkId?: string;
};

type ScriptureResource = {
  id: string;
  resourceType: "verse" | "verse_range" | "chapter" | "chapter_range";
  title: string;
  description: string | null;
  url: string | null;
  chapterStart: number;
  chapterEnd: number;
  verseStart: number | null;
  verseEnd: number | null;
};

type ResourceTab = "talks" | "verse" | "verse_range" | "chapter" | "chapter_range";

export default function ResourcesPanelContent({
  talks,
  resources,
  canManageResources,
  volume,
  book,
  chapter,
  verseStart,
  verseEnd,
  onCreated,
}: {
  talks: CitationTalk[];
  resources: ScriptureResource[];
  canManageResources: boolean;
  volume: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ResourceTab>("talks");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [resourceType, setResourceType] = useState<Exclude<ResourceTab, "talks">>("verse");
  const [chapterStart, setChapterStart] = useState(chapter);
  const [chapterEnd, setChapterEnd] = useState(chapter);
  const [formVerseStart, setFormVerseStart] = useState(verseStart);
  const [formVerseEnd, setFormVerseEnd] = useState(verseEnd);

  const grouped = useMemo(() => {
    return {
      verse: resources.filter((r) => r.resourceType === "verse"),
      verse_range: resources.filter((r) => r.resourceType === "verse_range"),
      chapter: resources.filter((r) => r.resourceType === "chapter"),
      chapter_range: resources.filter((r) => r.resourceType === "chapter_range"),
    };
  }, [resources]);

  const tabCounts: Record<ResourceTab, number> = {
    talks: talks.length,
    verse: grouped.verse.length,
    verse_range: grouped.verse_range.length,
    chapter: grouped.chapter.length,
    chapter_range: grouped.chapter_range.length,
  };

  async function handleCreate() {
    setFormError(null);
    if (!title.trim()) {
      setFormError("Title is required.");
      return;
    }
    setSubmitting(true);
    try {
      await fetch("/api/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          volume,
          book,
          resourceType,
          title,
          description: description || undefined,
          url: url || undefined,
          chapterStart,
          chapterEnd,
          verseStart: resourceType === "chapter" || resourceType === "chapter_range" ? undefined : formVerseStart,
          verseEnd: resourceType === "chapter" || resourceType === "chapter_range" ? undefined : formVerseEnd,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `Request failed ${res.status}`);
        }
      });
      setTitle("");
      setUrl("");
      setDescription("");
      onCreated();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to add resource.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="segmented-control overflow-x-auto" role="tablist" aria-label="Resource types">
        {([
          ["talks", "Talks"],
          ["verse", "Verse"],
          ["verse_range", "Verse range"],
          ["chapter", "Chapter"],
          ["chapter_range", "Chapter range"],
        ] as Array<[ResourceTab, string]>).map(([key, label]) => (
          <button
            key={key}
            className="segmented-control-button whitespace-nowrap"
            data-active={activeTab === key ? "true" : "false"}
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setActiveTab(key)}
          >
            {label} ({tabCounts[key]})
          </button>
        ))}
      </div>

      {activeTab === "talks" ? (
        talks.length === 0 ? (
          <p className="text-sm text-foreground/70">No talk resources found.</p>
        ) : (
          <ul className="space-y-2.5 max-h-[44vh] overflow-y-auto pr-1">
            {talks.map((t, idx) => (
              <li
                key={t.id ?? `${idx}-${t.title}`}
                className="border border-black/10 dark:border-white/15 rounded-lg p-3 bg-black/5 dark:bg-white/5 cursor-pointer"
                onClick={() => {
                  const talkId = t.talkId || (t.talkUrl ? (t.talkUrl.match(/talks_ajax\/(\d+)/)?.[1] ?? null) : null);
                  if (talkId) router.push(`/talk/${talkId}`);
                  else if (t.talkUrl) window.open(t.talkUrl, "_blank", "noopener,noreferrer");
                }}
              >
                <div className="text-xs text-foreground/70">{t.year} {t.session}</div>
                <div className="text-sm font-semibold">{t.title}</div>
                {t.speaker ? <div className="text-sm text-foreground/80">{t.speaker}</div> : null}
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className="space-y-2.5 max-h-[44vh] overflow-y-auto pr-1">
          {(grouped[activeTab] || []).map((resource) => (
            <li key={resource.id} className="border border-black/10 dark:border-white/15 rounded-lg p-3 bg-black/5 dark:bg-white/5">
              <div className="text-sm font-semibold">{resource.title}</div>
              {resource.description ? <p className="text-sm text-foreground/75 mt-1">{resource.description}</p> : null}
              <div className="text-xs text-foreground/65 mt-1">
                {resource.chapterStart === resource.chapterEnd ? `Chapter ${resource.chapterStart}` : `Chapters ${resource.chapterStart}-${resource.chapterEnd}`}
                {resource.verseStart ? ` • Verses ${resource.verseStart}-${resource.verseEnd ?? resource.verseStart}` : ""}
              </div>
              {resource.url ? (
                <a className="inline-flex mt-2 text-sm underline" href={resource.url} target="_blank" rel="noopener noreferrer">
                  Open resource
                </a>
              ) : null}
            </li>
          ))}
          {(grouped[activeTab] || []).length === 0 ? <p className="text-sm text-foreground/70">No resources found.</p> : null}
        </ul>
      )}

      {canManageResources ? (
        <div className="border border-black/10 dark:border-white/15 rounded-lg p-3 space-y-2">
          <h4 className="text-sm font-semibold">Add resource (admin)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL (optional)" className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
            <select value={resourceType} onChange={(e) => setResourceType(e.target.value as Exclude<ResourceTab, "talks">)} className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent">
              <option value="verse">Verse</option>
              <option value="verse_range">Verse range</option>
              <option value="chapter">Chapter</option>
              <option value="chapter_range">Chapter range</option>
            </select>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
            <input type="number" value={chapterStart} onChange={(e) => setChapterStart(Number(e.target.value))} className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
            <input type="number" value={chapterEnd} onChange={(e) => setChapterEnd(Number(e.target.value))} className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
            {resourceType === "verse" || resourceType === "verse_range" ? (
              <>
                <input type="number" value={formVerseStart} onChange={(e) => setFormVerseStart(Number(e.target.value))} className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
                <input type="number" value={formVerseEnd} onChange={(e) => setFormVerseEnd(Number(e.target.value))} className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
              </>
            ) : null}
          </div>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <button onClick={handleCreate} disabled={submitting} className="px-3 py-1.5 rounded-md border border-black/10 dark:border-white/15 text-sm">
            {submitting ? "Saving…" : "Add resource"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
