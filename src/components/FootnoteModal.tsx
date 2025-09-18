"use client";

import { useEffect, useState } from "react";
import { parseReferenceString, ReferenceParserResult, fetchChapterByBook } from "@/lib/openscripture";

export default function FootnoteModal({
  open,
  onClose,
  footnote,
  verseText,
  highlightText,
}: {
  open: boolean;
  onClose: () => void;
  footnote: string;
  verseText?: string;
  highlightText?: string;
}) {
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ReferenceParserResult | null>(null);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);
  const [passages, setPassages] = useState<Array<{ key: string; label: string; verses: Array<{ verse: number; text: string }> }>>([]);

  useEffect(() => {
    let alive = true;
    async function run() {
      setParsing(true);
      const res = await parseReferenceString(footnote);
      if (!alive) return;
      setParsed(res);
      setParsing(false);
    }
    if (open && footnote) {
      run();
    } else {
      setParsed(null);
      setParsing(false);
    }
    return () => {
      alive = false;
    };
  }, [open, footnote]);

  useEffect(() => {
    let alive = true;
    async function loadPassages() {
      if (!parsed || !parsed.valid || !parsed.references || parsed.references.length === 0) {
        setPassages([]);
        setRefError(null);
        return;
      }
      setLoadingRefs(true);
      setRefError(null);
      try {
        type Spec = { book: string; chapter: number; ranges?: Array<{ start: number; end: number }>; includeAll?: boolean };
        const specMap = new Map<string, Spec>();
        for (const r of parsed.references) {
          const book = r.book;
          for (const seg of r.chapters) {
            for (let c = seg.start; c <= seg.end; c++) {
              const key = `${book}:${c}`;
              let s = specMap.get(key);
              if (!s) {
                s = { book, chapter: c, ranges: [], includeAll: false };
                specMap.set(key, s);
              }
              const isEnd = c === seg.end;
              if (isEnd && Array.isArray(seg.verses) && seg.verses.length > 0) {
                for (const vr of seg.verses) {
                  s.ranges!.push({ start: vr.start, end: vr.end });
                }
              } else {
                s.includeAll = true;
                s.ranges = undefined;
              }
            }
          }
        }

        const specs = Array.from(specMap.values());
        const results = await Promise.all(
          specs.map(async (s) => {
            try {
              const chapter = await fetchChapterByBook(s.book, s.chapter);
              const label = chapter.reference;
              let verses = chapter.verses;
              if (!s.includeAll && s.ranges && s.ranges.length > 0) {
                const keep: number[] = [];
                for (const r of s.ranges) {
                  for (let v = r.start; v <= r.end; v++) keep.push(v);
                }
                const keepSet = new Set(keep);
                verses = verses.filter((v) => keepSet.has(v.verse));
              }
              return { key: `${s.book}:${s.chapter}`, label, verses };
          } catch {
              return { key: `${s.book}:${s.chapter}`, label: `${s.book} ${s.chapter}`, verses: [] as Array<{ verse: number; text: string }> };
            }
          })
        );
        if (!alive) return;
        setPassages(results);
      } catch {
        if (!alive) return;
        setRefError("Failed to load references");
        setPassages([]);
      } finally {
        if (alive) setLoadingRefs(false);
      }
    }
    if (open) {
      loadPassages();
    } else {
      setPassages([]);
      setLoadingRefs(false);
      setRefError(null);
    }
    return () => {
      alive = false;
    };
  }, [open, parsed]);

  if (!open) return null;

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
        {highlightText ? (
          <p className="text-sm text-foreground/80"><span className="text-foreground/60">Selection:</span> <span className="font-medium">{highlightText}</span></p>
        ) : null}
        {verseText ? (
          <p className="text-xs text-foreground/70">{verseText}</p>
        ) : null}

        <div className="space-y-2">
          <p className="text-sm leading-6 whitespace-pre-wrap">{footnote}</p>
          {parsing ? (
            <p className="text-xs text-foreground/60">Parsing references…</p>
          ) : parsed && parsed.valid && parsed.prettyString ? (
            <div className="text-sm">
              <div className="text-foreground/60 text-xs">Normalized references</div>
              <div className="mt-1">{parsed.prettyString}</div>
            </div>
          ) : null}
          {parsed && parsed.error ? (
            <p className="text-xs text-foreground/60">{parsed.error}</p>
          ) : null}
          {loadingRefs ? (
            <p className="text-xs text-foreground/60">Loading verses…</p>
          ) : null}
          {refError ? (
            <p className="text-xs text-red-600">{refError}</p>
          ) : null}
          {passages.length > 0 ? (
            <div className="space-y-3">
              {passages.map((p) => (
                <div key={p.key} className="border border-black/10 dark:border-white/15 rounded-md p-2">
                  <div className="text-sm font-medium mb-1">{p.label}</div>
                  <ol className="text-sm space-y-1">
                    {p.verses.map((v) => (
                      <li key={v.verse}>
                        <span className="text-foreground/60 mr-2">{v.verse}</span>
                        <span>{v.text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}


