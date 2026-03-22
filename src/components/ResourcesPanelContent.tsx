"use client";

import { useEffect, useMemo, useState } from "react";
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

type ResourceTab = "citations" | "curated";
type SelectionMode = "chapters" | "verses";
type ParsedCoverage = {
  chapterStart: number;
  chapterEnd: number;
  verseStart?: number;
  verseEnd?: number;
  resourceType: ScriptureResource["resourceType"];
};

function parseCoverage(value: string): ParsedCoverage | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/);
  if (!match) return null;

  const startChapter = Number(match[1]);
  const startVerse = match[2] ? Number(match[2]) : undefined;
  const endChapter = match[3] ? Number(match[3]) : startChapter;
  const endVerse = match[4] ? Number(match[4]) : startVerse;

  if ([startChapter, endChapter, startVerse, endVerse].some((value) => typeof value === "number" && (!Number.isFinite(value) || value <= 0))) {
    return null;
  }
  if (endChapter < startChapter) return null;
  if (startChapter === endChapter && typeof startVerse === "number" && typeof endVerse === "number" && endVerse < startVerse) return null;

  const hasVerse = typeof startVerse === "number";
  const spansChapter = startChapter !== endChapter;

  if (!hasVerse) {
    return {
      chapterStart: startChapter,
      chapterEnd: endChapter,
      resourceType: spansChapter ? "chapter_range" : "chapter",
    };
  }

  return {
    chapterStart: startChapter,
    chapterEnd: endChapter,
    verseStart: startVerse,
    verseEnd: endVerse,
    resourceType: spansChapter || startVerse !== endVerse ? "verse_range" : "verse",
  };
}

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
  const [activeTab, setActiveTab] = useState<ResourceTab>("citations");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [coverage, setCoverage] = useState(`${chapter}:${verseStart}${verseStart === verseEnd ? "" : `-${chapter}:${verseEnd}`}`);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("verses");
  const [browserChapter, setBrowserChapter] = useState(chapter);
  const [verseCounts, setVerseCounts] = useState<number[] | null>(null);
  const [selectedChapters, setSelectedChapters] = useState<number[]>([chapter]);
  const [selectedVerseKeys, setSelectedVerseKeys] = useState<string[]>(
    Array.from({ length: verseEnd - verseStart + 1 }, (_, index) => `${chapter}:${verseStart + index}`)
  );

  const tabCounts: Record<ResourceTab, number> = { citations: talks.length, curated: resources.length };
  const sortedResources = useMemo(() => [...resources], [resources]);
  const maxChapter = verseCounts?.length ?? chapter;
  const versesInBrowserChapter = verseCounts?.[browserChapter - 1] ?? 0;

  const interactiveCoverage = useMemo(() => {
    if (selectionMode === "chapters") {
      if (selectedChapters.length === 0) return "";
      const sorted = [...selectedChapters].sort((a, b) => a - b);
      return sorted[0] === sorted[sorted.length - 1] ? String(sorted[0]) : `${sorted[0]}-${sorted[sorted.length - 1]}`;
    }
    if (selectedVerseKeys.length === 0) return "";
    const sorted = [...selectedVerseKeys]
      .map((key) => {
        const [chapterPart, versePart] = key.split(":");
        return { chapter: Number(chapterPart), verse: Number(versePart) };
      })
      .sort((a, b) => (a.chapter === b.chapter ? a.verse - b.verse : a.chapter - b.chapter));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) return "";
    if (first.chapter === last.chapter && first.verse === last.verse) return `${first.chapter}:${first.verse}`;
    return `${first.chapter}:${first.verse}-${last.chapter}:${last.verse}`;
  }, [selectedChapters, selectedVerseKeys, selectionMode]);

  useEffect(() => {
    let cancelled = false;
    async function loadVerseCounts() {
      try {
        const res = await fetch(`/api/tools/quick-nav?volume=${encodeURIComponent(volume)}&book=${encodeURIComponent(book)}`, { cache: "force-cache" });
        if (!res.ok) return;
        const payload = (await res.json()) as { verseCounts?: number[] };
        if (!cancelled && Array.isArray(payload.verseCounts) && payload.verseCounts.length > 0) {
          setVerseCounts(payload.verseCounts);
        }
      } catch {
        // Best effort helper only.
      }
    }
    void loadVerseCounts();
    return () => {
      cancelled = true;
    };
  }, [volume, book]);

  useEffect(() => {
    if (!verseCounts?.length) return;
    setBrowserChapter((prev) => Math.min(Math.max(prev, 1), verseCounts.length));
    setSelectedChapters((prev) => prev.filter((value) => value >= 1 && value <= verseCounts.length));
    setSelectedVerseKeys((prev) =>
      prev.filter((value) => {
        const [chapterPart, versePart] = value.split(":");
        const chapterNumber = Number(chapterPart);
        const verseNumber = Number(versePart);
        return chapterNumber >= 1 && chapterNumber <= verseCounts.length && verseNumber >= 1 && verseNumber <= (verseCounts[chapterNumber - 1] ?? 0);
      })
    );
  }, [verseCounts]);

  function toggleChapterSelection(targetChapter: number) {
    setSelectedChapters((prev) => (prev.includes(targetChapter) ? prev.filter((value) => value !== targetChapter) : [...prev, targetChapter]));
  }

  function toggleVerseSelection(targetChapter: number, targetVerse: number) {
    const key = `${targetChapter}:${targetVerse}`;
    setSelectedVerseKeys((prev) => (prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]));
  }

  async function handleCreate() {
    setFormError(null);
    if (!title.trim()) {
      setFormError("Title is required.");
      return;
    }
    const parsedCoverage = parseCoverage(coverage);
    if (!parsedCoverage) {
      setFormError("Coverage must look like 3, 3-5, 3:16, or 3:16-4:2.");
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
          resourceType: parsedCoverage.resourceType,
          title,
          description: description || undefined,
          url: url || undefined,
          chapterStart: parsedCoverage.chapterStart,
          chapterEnd: parsedCoverage.chapterEnd,
          verseStart: parsedCoverage.verseStart,
          verseEnd: parsedCoverage.verseEnd,
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
      setCoverage(`${chapter}:${verseStart}${verseStart === verseEnd ? "" : `-${chapter}:${verseEnd}`}`);
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
          ["citations", "Citations"],
          ["curated", "Curated"],
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

      {activeTab === "citations" ? (
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
          {sortedResources.map((resource) => (
            <li key={resource.id} className="border border-black/10 dark:border-white/15 rounded-lg p-3 bg-black/5 dark:bg-white/5">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold">{resource.title}</div>
                <span className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-black/10 dark:border-white/15">
                  {resource.resourceType.replace("_", " ")}
                </span>
              </div>
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
          {sortedResources.length === 0 ? <p className="text-sm text-foreground/70">No curated resources found.</p> : null}
        </ul>
      )}

      {canManageResources ? (
        <div className="border border-black/10 dark:border-white/15 rounded-lg p-3 space-y-2">
          <h4 className="text-sm font-semibold">Add resource (admin)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL (optional)" className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
            <input
              value={coverage}
              onChange={(e) => setCoverage(e.target.value)}
              placeholder="Coverage (e.g. 3:16-4:2 or 3-5)"
              className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent sm:col-span-2"
            />
          </div>
          <p className="text-xs text-foreground/65">
            Use formats: <code>3</code>, <code>3-5</code>, <code>3:16</code>, <code>3:16-4:2</code>.
          </p>
          <div className="space-y-2 rounded-md border border-black/10 dark:border-white/15 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium uppercase tracking-wide text-foreground/65">Interactive selector</div>
              <div className="segmented-control" role="tablist" aria-label="Selection mode">
                {([
                  ["verses", "Verses"],
                  ["chapters", "Chapters"],
                ] as Array<[SelectionMode, string]>).map(([modeKey, label]) => (
                  <button
                    key={modeKey}
                    type="button"
                    className="segmented-control-button"
                    data-active={selectionMode === modeKey ? "true" : "false"}
                    onClick={() => setSelectionMode(modeKey)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                className="px-2 py-1 rounded-md border border-black/10 dark:border-white/15"
                onClick={() => setBrowserChapter((value) => Math.max(1, value - 1))}
              >
                Prev
              </button>
              <div>Chapter {browserChapter}</div>
              <button
                type="button"
                className="px-2 py-1 rounded-md border border-black/10 dark:border-white/15"
                onClick={() => setBrowserChapter((value) => Math.min(maxChapter, value + 1))}
              >
                Next
              </button>
            </div>

            {selectionMode === "chapters" ? (
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {Array.from({ length: maxChapter }, (_, index) => index + 1).map((chapterNumber) => {
                  const active = selectedChapters.includes(chapterNumber);
                  return (
                    <button
                      key={`chapter-${chapterNumber}`}
                      type="button"
                      onClick={() => toggleChapterSelection(chapterNumber)}
                      className="px-2 py-1 text-xs rounded-md border border-black/10 dark:border-white/15"
                      data-active={active ? "true" : "false"}
                    >
                      {chapterNumber}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                {Array.from({ length: versesInBrowserChapter }, (_, index) => index + 1).map((verseNumber) => {
                  const key = `${browserChapter}:${verseNumber}`;
                  const active = selectedVerseKeys.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleVerseSelection(browserChapter, verseNumber)}
                      className="px-2 py-1 text-xs rounded-md border border-black/10 dark:border-white/15"
                      data-active={active ? "true" : "false"}
                    >
                      {verseNumber}
                    </button>
                  );
                })}
                {versesInBrowserChapter === 0 ? <span className="text-xs text-foreground/60">Loading verses…</span> : null}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-foreground/65">Selection preview: {interactiveCoverage || "None selected"}</span>
              <button
                type="button"
                onClick={() => setCoverage(interactiveCoverage)}
                disabled={!interactiveCoverage}
                className="px-2 py-1 rounded-md border border-black/10 dark:border-white/15"
              >
                Use selection
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCoverage(`${chapter}:${verseStart}${verseStart === verseEnd ? "" : `-${chapter}:${verseEnd}`}`)}
              className="px-2 py-1 rounded-md border border-black/10 dark:border-white/15 text-xs"
            >
              Use selected verses
            </button>
            <button
              type="button"
              onClick={() => setCoverage(String(chapter))}
              className="px-2 py-1 rounded-md border border-black/10 dark:border-white/15 text-xs"
            >
              Use current chapter
            </button>
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
