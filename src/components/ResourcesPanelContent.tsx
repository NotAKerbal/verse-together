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

type ResourceTab = "citations" | "curated";

export default function ResourcesPanelContent({
  talks,
  resources,
}: {
  talks: CitationTalk[];
  resources: ScriptureResource[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ResourceTab>("citations");

  const tabCounts: Record<ResourceTab, number> = { citations: talks.length, curated: resources.length };
  const sortedResources = useMemo(() => [...resources], [resources]);

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

    </div>
  );
}
