"use client";

import { useMemo } from "react";
import {
  buildScriptureBrowseHref,
  extractFootnoteStudyLinks,
  getToolLabel,
  hasUnparsedFootnoteContent,
  parseFootnoteScriptureReferences,
} from "@/lib/footnoteReferences";

type JumpItem = {
  key: string;
  label: string;
  href: string | null;
};

export default function FootnoteModal({
  open,
  onClose,
  footnote,
  variant = "modal",
}: {
  open: boolean;
  onClose: () => void;
  footnote: string;
  verseText?: string;
  highlightText?: string;
  variant?: "modal" | "panel";
}) {
  const studyLinks = useMemo(() => extractFootnoteStudyLinks(footnote), [footnote]);
  const localReferences = useMemo(() => parseFootnoteScriptureReferences(footnote), [footnote]);
  const hasUnparsedContent = useMemo(() => hasUnparsedFootnoteContent(footnote), [footnote]);
  const showRawFootnote = hasUnparsedContent || (localReferences.length === 0 && studyLinks.length === 0);

  const jumpItems = useMemo(() => {
    const byKey = new Map<string, JumpItem>();
    for (const ref of localReferences) {
      const jumpVerse = ref.verses.length > 0 ? Math.min(...ref.verses) : undefined;
      const href = buildScriptureBrowseHref(ref.book, ref.chapter, jumpVerse);
      const verseSuffix =
        ref.verses.length > 0
          ? `:${ref.verses.join(",")}`
          : "";
      const label = `${ref.bookLabel} ${ref.chapter}${verseSuffix}`;
      const key = `${ref.book}:${ref.chapter}:${ref.verses.join(",")}`;
      if (!byKey.has(key)) {
        byKey.set(key, { key, label, href });
      }
    }
    return Array.from(byKey.values());
  }, [localReferences]);

  if (!open) return null;

  const content = (
    <div className="space-y-2">
      {showRawFootnote ? <p className="text-sm leading-6 whitespace-pre-wrap">{footnote}</p> : null}
      {jumpItems.length > 0 ? (
        <p className="text-xs text-foreground/60">
          Resolved {jumpItems.length} scripture reference{jumpItems.length === 1 ? "" : "s"} from footnote text.
        </p>
      ) : null}
      {jumpItems.length > 0 ? (
        <div className="space-y-2">
          <div className="text-foreground/60 text-xs">Scripture references</div>
          {jumpItems.map((item) => (
            <div key={item.key} className="border border-black/10 dark:border-white/15 rounded-md p-2 flex items-center justify-between gap-2">
              <span className="text-sm">{item.label}</span>
              {item.href ? (
                <a
                  href={item.href}
                  onClick={() => onClose()}
                  className="text-xs px-2 py-0.5 rounded border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Jump
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {studyLinks.length > 0 ? (
        <div className="space-y-1">
          <div className="text-foreground/60 text-xs">Study links</div>
          <div className="flex flex-wrap gap-2">
            {studyLinks.map((link, idx) =>
              link.href ? (
                <a
                  key={`${link.kind}-${link.query ?? "q"}-${idx}`}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 text-xs rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
                  title={getToolLabel(link.kind)}
                >
                  {link.label}
                </a>
              ) : (
                <span
                  key={`${link.kind}-${link.query ?? "q"}-${idx}`}
                  className="px-2 py-1 text-xs rounded-md border border-black/10 dark:border-white/15 text-foreground/70"
                  title={getToolLabel(link.kind)}
                >
                  {link.label}
                </span>
              )
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (variant === "panel") {
    return (
      <div className="rounded-lg border surface-card backdrop-blur p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Footnote</h3>
          <button onClick={() => onClose()} className="px-2.5 py-1 text-sm rounded-md border border-black/10 dark:border-white/15">
            Close
          </button>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close"
        onClick={() => onClose()}
        className="absolute inset-0 bg-black/30"
      />
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-background shadow-2xl border-t border-black/10 dark:border-white/15 p-4 space-y-3 max-h-[80vh] overflow-y-auto">
        <div className="h-1 w-10 bg-foreground/20 rounded-full mx-auto mb-1" />
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold">Footnote</h3>
          <button
            onClick={() => onClose()}
            className="px-3 py-1.5 text-xs rounded-md border border-black/10 dark:border-white/15"
          >
            Close
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}
