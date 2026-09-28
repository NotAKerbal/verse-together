"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { InsightDraftBlock } from "@/lib/appData";

type BlockEditorProps = {
  block: InsightDraftBlock;
  onHighlightWordsChange?: (highlightWordIndices: number[]) => void;
};

type WordStyleHint = {
  bold?: boolean;
  italic?: boolean;
};

function tokenizeWords(text: string) {
  const matches = text.match(/\S+\s*/g);
  return matches ?? [];
}

export function normalizeDictionaryEntryText(raw: string): string {
  return String(raw || "")
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:div|p|blockquote)\b[^>]*>/gi, "\n\n")
    .replace(/<\/?li\b[^>]*>/gi, "\n")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractDictionaryWordStyleHints(raw: string): WordStyleHint[] {
  if (typeof document === "undefined") return [];
  const container = document.createElement("div");
  container.innerHTML = String(raw || "");
  const hints: WordStyleHint[] = [];

  function walk(node: Node, inherited: WordStyleHint) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      const words = text.match(/\S+/g) ?? [];
      for (let i = 0; i < words.length; i += 1) {
        hints.push({ bold: !!inherited.bold, italic: !!inherited.italic });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const next: WordStyleHint = {
      bold: inherited.bold || tag === "b" || tag === "strong",
      italic: inherited.italic || tag === "i" || tag === "em",
    };
    for (const child of Array.from(el.childNodes)) {
      walk(child, next);
    }
  }

  for (const child of Array.from(container.childNodes)) {
    walk(child, { bold: false, italic: false });
  }
  return hints;
}

function rangeIndices(start: number, end: number) {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const out: number[] = [];
  for (let i = lo; i <= hi; i += 1) out.push(i);
  return out;
}

function WordHighlightEditor({
  sourceText,
  highlightedIndices,
  wordStyleHints,
  onHighlightWordsChange,
}: {
  sourceText: string;
  highlightedIndices: number[];
  wordStyleHints?: WordStyleHint[];
  onHighlightWordsChange?: (highlightWordIndices: number[]) => void;
}) {
  const displayTokens = useMemo(() => {
    const wordTokens = sourceText.match(/\S+\s*/g) ?? [];
    return wordTokens.flatMap((token, wordIndex) => {
      const newlineMatch = token.match(/(\r?\n)+[ \t]*$/);
      if (!newlineMatch) {
        return [{ type: "word" as const, value: token, wordIndex }];
      }
      const newlinePart = newlineMatch[0];
      const wordPart = token.slice(0, -newlinePart.length);
      const parts: Array<{ type: "word" | "newline"; value: string; wordIndex?: number }> = [];
      if (wordPart) {
        parts.push({ type: "word", value: wordPart, wordIndex });
      }
      parts.push({ type: "newline", value: newlinePart });
      return parts as Array<{ type: "word" | "newline"; value: string; wordIndex?: number }>;
    });
  }, [sourceText]);
  const serverIndices = useMemo(
    () => [...(highlightedIndices ?? [])].sort((a, b) => a - b),
    [highlightedIndices]
  );
  const [selectedIndices, setSelectedIndices] = useState<number[]>(serverIndices);
  const dragModeRef = useRef<"add" | "remove" | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const dragCurrentRef = useRef<number | null>(null);
  const dragBaselineRef = useRef<Set<number>>(new Set(serverIndices));
  const baselineRef = useRef<string>(serverIndices.join(","));

  useEffect(() => {
    setSelectedIndices(serverIndices);
    baselineRef.current = serverIndices.join(",");
  }, [serverIndices]);

  const selectedSet = useMemo(() => new Set(selectedIndices), [selectedIndices]);
  const selectedIndicesKey = useMemo(() => selectedIndices.join(","), [selectedIndices]);

  function applyDragPreview(endWordIdx: number) {
    const mode = dragModeRef.current;
    const startWordIdx = dragStartRef.current;
    if (!mode || startWordIdx == null) return;
    dragCurrentRef.current = endWordIdx;
    const next = new Set(dragBaselineRef.current);
    const affected = rangeIndices(startWordIdx, endWordIdx);
    affected.forEach((idx) => {
      if (mode === "add") next.add(idx);
      else next.delete(idx);
    });
    setSelectedIndices(Array.from(next).sort((a, b) => a - b));
  }

  useEffect(() => {
    function resolveWordIdxFromPoint(clientX: number, clientY: number) {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      if (!element) return null;
      const target = element.closest("[data-word-index]") as HTMLElement | null;
      if (!target) return null;
      const raw = target.getAttribute("data-word-index");
      if (!raw) return null;
      const idx = Number(raw);
      return Number.isFinite(idx) ? idx : null;
    }

    function handlePointerMove(e: PointerEvent) {
      if (dragModeRef.current == null) return;
      const idx = resolveWordIdxFromPoint(e.clientX, e.clientY);
      if (idx == null) return;
      if (dragCurrentRef.current === idx) return;
      applyDragPreview(idx);
    }

    function handlePointerUp() {
      if (dragModeRef.current == null) return;
      dragModeRef.current = null;
      dragStartRef.current = null;
      dragCurrentRef.current = null;
      if (selectedIndicesKey !== baselineRef.current) {
        onHighlightWordsChange?.(selectedIndices);
        baselineRef.current = selectedIndicesKey;
      }
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [onHighlightWordsChange, selectedIndices, selectedIndicesKey]);

  function handleWordPointerDown(wordIdx: number, e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    const isSelected = selectedSet.has(wordIdx);
    const mode: "add" | "remove" = isSelected ? "remove" : "add";
    dragModeRef.current = mode;
    dragStartRef.current = wordIdx;
    dragCurrentRef.current = wordIdx;
    dragBaselineRef.current = new Set(selectedSet);
    applyDragPreview(wordIdx);
  }

  return (
    <div className="whitespace-pre-wrap py-0.5 text-sm leading-6 select-none">
      {sourceText ? (
        displayTokens.map((token, idx) => {
          if (token.type === "newline") {
            return <span key={`nl-${idx}`}>{token.value}</span>;
          }
          const wordIdx = token.wordIndex as number;
          const highlighted = selectedSet.has(wordIdx);
          const prevHighlighted = selectedSet.has(wordIdx - 1);
          const nextHighlighted = selectedSet.has(wordIdx + 1);
          return (
            <button
              key={`w-${wordIdx}`}
              type="button"
              data-word-index={wordIdx}
              onPointerDown={(e) => handleWordPointerDown(wordIdx, e)}
              className={`inline transition-colors ${
                highlighted
                  ? [
                      "bg-[color:var(--accent-primary)] text-[#17161a]",
                      prevHighlighted ? "" : "rounded-l-sm",
                      nextHighlighted ? "" : "rounded-r-sm",
                    ].join(" ")
                  : "hover:bg-[color:var(--surface-button-hover)]"
              } ${wordStyleHints?.[wordIdx]?.bold ? "font-semibold" : ""} ${wordStyleHints?.[wordIdx]?.italic ? "italic" : ""}`}
              title="Toggle highlight"
            >
              {token.value}
            </button>
          );
        })
      ) : (
        <span className="text-foreground/60">No text is available for highlighting.</span>
      )}
    </div>
  );
}

export function ScriptureBlockEditor({ block, onHighlightWordsChange }: BlockEditorProps) {
  const sourceText = block.text ?? "";
  return (
    <div className="space-y-2">
      <WordHighlightEditor
        sourceText={sourceText}
        highlightedIndices={block.highlight_word_indices ?? []}
        onHighlightWordsChange={onHighlightWordsChange}
      />
    </div>
  );
}

/** Highlight-words view of a quote. The quote text and source link are edited by the block card. */
export function QuoteBlockEditor({ block, onHighlightWordsChange }: BlockEditorProps) {
  const sourceText = block.text ?? "";
  const [expanded, setExpanded] = useState(false);
  const allTokens = useMemo(() => tokenizeWords(sourceText), [sourceText]);
  const allHighlights = useMemo(
    () =>
      [...(block.highlight_word_indices ?? [])]
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < allTokens.length)
        .sort((a, b) => a - b),
    [block.highlight_word_indices, allTokens.length]
  );
  const COLLAPSED_TOKEN_COUNT = 140;
  const CONTEXT_TOKENS = 40;
  const collapseAnchor = allHighlights[0] ?? 0;
  const collapsedStart = useMemo(() => {
    if (allTokens.length <= COLLAPSED_TOKEN_COUNT) return 0;
    const start = Math.max(0, collapseAnchor - CONTEXT_TOKENS);
    const maxStart = Math.max(0, allTokens.length - COLLAPSED_TOKEN_COUNT);
    return Math.min(start, maxStart);
  }, [allTokens.length, collapseAnchor]);
  const collapsedEnd = useMemo(
    () => Math.min(allTokens.length, collapsedStart + COLLAPSED_TOKEN_COUNT),
    [allTokens.length, collapsedStart]
  );
  const isCollapsedView = !expanded && allTokens.length > COLLAPSED_TOKEN_COUNT;
  const visibleStart = isCollapsedView ? collapsedStart : 0;
  const visibleEnd = isCollapsedView ? collapsedEnd : allTokens.length;
  const visibleText = useMemo(() => allTokens.slice(visibleStart, visibleEnd).join(""), [allTokens, visibleStart, visibleEnd]);
  const visibleHighlights = useMemo(
    () =>
      allHighlights
        .filter((idx) => idx >= visibleStart && idx < visibleEnd)
        .map((idx) => idx - visibleStart),
    [allHighlights, visibleStart, visibleEnd]
  );
  const hasHiddenPrefix = visibleStart > 0;
  const hasHiddenSuffix = visibleEnd < allTokens.length;

  useEffect(() => {
    setExpanded(false);
  }, [block.id, sourceText]);

  function handleVisibleHighlightsChange(nextVisibleIndices: number[]) {
    const nextVisibleAbs = nextVisibleIndices.map((idx) => idx + visibleStart);
    const hiddenPersist = allHighlights.filter((idx) => idx < visibleStart || idx >= visibleEnd);
    const nextAll = Array.from(new Set([...hiddenPersist, ...nextVisibleAbs])).sort((a, b) => a - b);
    onHighlightWordsChange?.(nextAll);
  }

  return (
    <div className="space-y-2">
      {sourceText.trim() ? (
        <div className="space-y-1">
          <div className="text-[11px] text-foreground/55">Tap words to highlight them</div>
          {hasHiddenPrefix ? <div className="text-[11px] text-foreground/50">... earlier text hidden</div> : null}
          <WordHighlightEditor
            sourceText={visibleText}
            highlightedIndices={visibleHighlights}
            onHighlightWordsChange={handleVisibleHighlightsChange}
          />
          {hasHiddenSuffix ? <div className="text-[11px] text-foreground/50">... later text hidden</div> : null}
          {allTokens.length > COLLAPSED_TOKEN_COUNT ? (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="surface-button rounded-full border-2 px-2.5 py-1 text-[0.7rem]"
            >
              {expanded ? "Show less" : "Show the whole quote"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DictionaryBlockEditor({
  block,
  onHighlightWordsChange,
}: {
  block: InsightDraftBlock;
  onHighlightWordsChange?: (highlightWordIndices: number[]) => void;
}) {
  const sourceText = useMemo(() => normalizeDictionaryEntryText(block.text ?? ""), [block.text]);
  const wordStyleHints = useMemo(() => extractDictionaryWordStyleHints(block.text ?? ""), [block.text]);
  const dictionaryMeta = block.dictionary_meta;
  const isEtymology = dictionaryMeta?.edition === "ETY";
  const sourceLabel = isEtymology
    ? dictionaryMeta?.heading?.trim() || "Etymology"
    : dictionaryMeta
    ? `${dictionaryMeta.edition} Webster`
    : "Dictionary";
  const headingLabel = dictionaryMeta?.heading?.trim() || "";
  const showHeadingLabel = !isEtymology && headingLabel.length > 0 && headingLabel !== sourceLabel;
  const [expanded, setExpanded] = useState(false);
  const isLong = sourceText.length > 1800;
  const allTokens = useMemo(() => tokenizeWords(sourceText), [sourceText]);
  const allHighlights = useMemo(
    () =>
      [...(block.highlight_word_indices ?? [])]
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < allTokens.length)
        .sort((a, b) => a - b),
    [block.highlight_word_indices, allTokens.length]
  );
  const COLLAPSED_TOKEN_COUNT = 140;
  const CONTEXT_TOKENS = 40;
  const collapseAnchor = allHighlights[0] ?? 0;
  const collapsedStart = useMemo(() => {
    if (allTokens.length <= COLLAPSED_TOKEN_COUNT) return 0;
    const start = Math.max(0, collapseAnchor - CONTEXT_TOKENS);
    const maxStart = Math.max(0, allTokens.length - COLLAPSED_TOKEN_COUNT);
    return Math.min(start, maxStart);
  }, [allTokens.length, collapseAnchor]);
  const collapsedEnd = useMemo(
    () => Math.min(allTokens.length, collapsedStart + COLLAPSED_TOKEN_COUNT),
    [allTokens.length, collapsedStart]
  );
  const isCollapsedView = !expanded && allTokens.length > COLLAPSED_TOKEN_COUNT;
  const visibleStart = isCollapsedView ? collapsedStart : 0;
  const visibleEnd = isCollapsedView ? collapsedEnd : allTokens.length;
  const visibleText = useMemo(() => allTokens.slice(visibleStart, visibleEnd).join(""), [allTokens, visibleStart, visibleEnd]);
  const visibleHighlights = useMemo(
    () =>
      allHighlights
        .filter((idx) => idx >= visibleStart && idx < visibleEnd)
        .map((idx) => idx - visibleStart),
    [allHighlights, visibleStart, visibleEnd]
  );
  const hasHiddenPrefix = visibleStart > 0;
  const hasHiddenSuffix = visibleEnd < allTokens.length;

  useEffect(() => {
    setExpanded(false);
  }, [block.id, sourceText]);

  function handleVisibleHighlightsChange(nextVisibleIndices: number[]) {
    const nextVisibleAbs = nextVisibleIndices.map((idx) => idx + visibleStart);
    const hiddenPersist = allHighlights.filter((idx) => idx < visibleStart || idx >= visibleEnd);
    const nextAll = Array.from(new Set([...hiddenPersist, ...nextVisibleAbs])).sort((a, b) => a - b);
    onHighlightWordsChange?.(nextAll);
  }

  return (
    <div className="space-y-2">
      {dictionaryMeta ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-foreground/70">
          <span className="rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] px-2 py-0.5 font-semibold">
            {isEtymology ? "Etymology" : "Dictionary"}
          </span>
          <span className="rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] px-2 py-0.5 font-semibold">
            {sourceLabel}
          </span>
          {showHeadingLabel ? (
            <span className="rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] px-2 py-0.5 font-semibold">{headingLabel}</span>
          ) : null}
          {dictionaryMeta.pronounce ? (
            <span className="rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] px-2 py-0.5 font-semibold">{dictionaryMeta.pronounce}</span>
          ) : null}
        </div>
      ) : null}
      {sourceText.trim() ? (
        <div className={`space-y-1 ${!expanded && isLong ? "max-h-64 overflow-hidden" : ""}`}>
          {hasHiddenPrefix ? <div className="text-[11px] text-foreground/50">... earlier text hidden</div> : null}
          <WordHighlightEditor
            sourceText={visibleText}
            highlightedIndices={visibleHighlights}
            wordStyleHints={wordStyleHints.slice(visibleStart, visibleEnd)}
            onHighlightWordsChange={handleVisibleHighlightsChange}
          />
          {hasHiddenSuffix ? <div className="text-[11px] text-foreground/50">... later text hidden</div> : null}
        </div>
      ) : null}
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="surface-button rounded-full border-2 px-2.5 py-1 text-[0.7rem]"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
