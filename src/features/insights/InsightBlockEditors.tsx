"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { InsightDraftBlock } from "@/lib/appData";

type BlockEditorProps = {
  block: InsightDraftBlock;
  onTextChange: (text: string) => void;
  onLinkChange: (linkUrl: string) => void;
  onHighlightWordsChange?: (highlightWordIndices: number[]) => void;
};

function tokenizeWords(text: string) {
  const matches = text.match(/\S+\s*/g);
  return matches ?? [];
}

function rangeIndices(start: number, end: number) {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const out: number[] = [];
  for (let i = lo; i <= hi; i += 1) out.push(i);
  return out;
}

export function ScriptureBlockEditor({ block, onHighlightWordsChange }: BlockEditorProps) {
  const sourceText = block.text ?? "";
  const tokens = useMemo(() => tokenizeWords(sourceText), [sourceText]);
  const serverIndices = useMemo(
    () => [...(block.highlight_word_indices ?? [])].sort((a, b) => a - b),
    [block.highlight_word_indices]
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
    <div className="space-y-2">
      <div className="px-1 py-1 text-sm whitespace-pre-wrap select-none">
        {sourceText ? (
          tokens.map((token, wordIdx) => {
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
                        "bg-amber-300/70 dark:bg-amber-400/40",
                        prevHighlighted ? "" : "rounded-l-sm",
                        nextHighlighted ? "" : "rounded-r-sm",
                      ].join(" ")
                    : "hover:bg-black/10 dark:hover:bg-white/10"
                }`}
                title="Toggle highlight"
              >
                {token}
              </button>
            );
          })
        ) : (
          <span>No scripture text is available for this block yet.</span>
        )}
      </div>
    </div>
  );
}

export function TextBlockEditor({ block, onTextChange }: BlockEditorProps) {
  return (
    <textarea
      value={block.text ?? ""}
      onChange={(e) => onTextChange(e.target.value)}
      rows={4}
      className="w-full bg-transparent px-1 py-1 text-sm focus:outline-none"
      placeholder="Write your insight..."
    />
  );
}

export function QuoteBlockEditor({ block, onTextChange, onLinkChange }: BlockEditorProps) {
  return (
    <div className="space-y-2">
      <textarea
        value={block.text ?? ""}
        onChange={(e) => onTextChange(e.target.value)}
        rows={3}
        className="w-full bg-transparent px-1 py-1 text-sm focus:outline-none"
        placeholder="Quote text..."
      />
      <input
        value={block.link_url ?? ""}
        onChange={(e) => onLinkChange(e.target.value)}
        className="w-full bg-transparent px-1 py-1 text-xs text-foreground/70 focus:outline-none"
        placeholder="Source link (https://...)"
      />
    </div>
  );
}
