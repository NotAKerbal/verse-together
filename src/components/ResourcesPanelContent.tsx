"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CitationTalk } from "@/lib/citations";
import type { ScriptureResource, ScriptureResourceScope } from "@/lib/citationsApi";

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

  function formatCoverage(coverage: ScriptureResourceScope) {
    const startBook = coverage.book.replace(/-/g, " ");
    const endBook = coverage.bookEnd.replace(/-/g, " ");
    const bookLabel = startBook === endBook ? startBook : `${startBook} - ${endBook}`;
    const chapterLabel =
      coverage.chapterStart === coverage.chapterEnd
        ? `Chapter ${coverage.chapterStart}`
        : `Chapters ${coverage.chapterStart}-${coverage.chapterEnd}`;
    const verseLabel = coverage.verseStart
      ? ` • Verses ${coverage.verseStart}-${coverage.verseEnd ?? coverage.verseStart}`
      : "";
    return `${bookLabel} • ${chapterLabel}${verseLabel}`;
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
              <div className="text-sm font-semibold">{resource.title}</div>
              {resource.description ? <p className="text-sm text-foreground/75 mt-1">{resource.description}</p> : null}
              {resource.matchedScopes.length > 0 ? (
                <div className="mt-1 space-y-1 text-xs text-foreground/65">
                  {resource.matchedScopes.map((coverage, index) => (
                    <div key={`${resource.id}-matched-${coverage.book}-${coverage.chapterStart}-${coverage.verseStart ?? "chapter"}-${index}`}>
                      {formatCoverage(coverage)}
                    </div>
                  ))}
                </div>
              ) : null}
              {resource.matchedScopes.length === 0 ? (
                <div className="mt-1 space-y-1 text-xs text-foreground/65">
                  {resource.coverages.map((coverage, index) => (
                    <div key={`${resource.id}-${coverage.book}-${coverage.chapterStart}-${coverage.verseStart ?? "chapter"}-${index}`}>
                      {formatCoverage(coverage)}
                    </div>
                  ))}
                </div>
              ) : null}
              {resource.url ? (
                <a
                  className="inline-flex mt-2 items-center justify-center rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm"
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
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
