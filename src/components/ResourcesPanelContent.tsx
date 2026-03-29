"use client";

import { useMemo } from "react";
import type { ScriptureResource, ScriptureResourceScope } from "@/lib/citationsApi";

export default function ResourcesPanelContent({
  resources,
}: {
  resources: ScriptureResource[];
}) {
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
    </div>
  );
}
