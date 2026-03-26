"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { LocalBrowseBook, LocalVolumeSummary } from "@/lib/ldsLocalData.server";
import { getScriptureVolumeLabel } from "@/lib/scriptureVolumes";

type SelectionMode = "chapters" | "verses";
type ResourceType = "verse" | "verse_range" | "chapter" | "chapter_range";

type Props = {
  volumes: LocalVolumeSummary[];
  booksByVolume: Record<string, LocalBrowseBook[]>;
};

type SaveState = {
  error: string | null;
  success: string | null;
};

type ChapterPoint = {
  bookId: string;
  chapter: number;
};

type CoverageSelection = {
  book: string;
  bookEnd: string;
  bookOrder: number;
  bookEndOrder: number;
  chapterStart: number;
  chapterEnd: number;
  verseStart?: number;
  verseEnd?: number;
  resourceType: ResourceType;
  label: string;
  key: string;
};

function SelectionPill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
        active
          ? "border-black/70 bg-black text-white dark:border-white/70 dark:bg-white dark:text-black"
          : "border-black/10 bg-background/70 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function compareChapterPoints(a: ChapterPoint, b: ChapterPoint, books: LocalBrowseBook[]) {
  const aBookIndex = books.findIndex((book) => book.id === a.bookId);
  const bBookIndex = books.findIndex((book) => book.id === b.bookId);
  if (aBookIndex !== bBookIndex) return aBookIndex - bBookIndex;
  return a.chapter - b.chapter;
}

function normalizeChapterRange(a: ChapterPoint, b: ChapterPoint, books: LocalBrowseBook[]) {
  return compareChapterPoints(a, b, books) <= 0 ? [a, b] as const : [b, a] as const;
}

function formatVerseRange(start: number | null, end: number | null) {
  if (start == null) return "";
  if (end == null || start === end) return String(start);
  return `${Math.min(start, end)}-${Math.max(start, end)}`;
}

function formatChapterPoint(point: ChapterPoint | null, books: LocalBrowseBook[]) {
  if (!point) return "";
  const book = books.find((entry) => entry.id === point.bookId);
  if (!book) return `${point.bookId} ${point.chapter}`;
  return `${book.label} ${point.chapter}`;
}

export default function ResourceManagerWorkspace({ volumes, booksByVolume }: Props) {
  const [selectedVolume, setSelectedVolume] = useState(volumes[0]?.id ?? "");
  const books = useMemo(() => booksByVolume[selectedVolume] ?? [], [booksByVolume, selectedVolume]);

  const [focusedBookId, setFocusedBookId] = useState("");
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("chapters");
  const [activeChapter, setActiveChapter] = useState(1);
  const [chapterStart, setChapterStart] = useState<ChapterPoint | null>(null);
  const [chapterEnd, setChapterEnd] = useState<ChapterPoint | null>(null);
  const [verseStart, setVerseStart] = useState<number | null>(null);
  const [verseEnd, setVerseEnd] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [pendingSelections, setPendingSelections] = useState<CoverageSelection[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ error: null, success: null });

  useEffect(() => {
    const nextBookId = books[0]?.id ?? "";
    setFocusedBookId(nextBookId);
    setActiveChapter(1);
    setChapterStart(nextBookId ? { bookId: nextBookId, chapter: 1 } : null);
    setChapterEnd(null);
    setVerseStart(1);
    setVerseEnd(null);
    setPendingSelections([]);
    setSaveState({ error: null, success: null });
  }, [books]);

  const focusedBook = useMemo(
    () => books.find((book) => book.id === focusedBookId) ?? books[0] ?? null,
    [books, focusedBookId]
  );

  useEffect(() => {
    if (!focusedBook) return;
    setActiveChapter((current) => Math.min(Math.max(current, 1), focusedBook.chapters));
  }, [focusedBook]);

  const verseCount = focusedBook?.chapterVerseCounts[activeChapter - 1] ?? 0;

  useEffect(() => {
    if (verseCount <= 0) {
      setVerseStart(null);
      setVerseEnd(null);
      return;
    }
    setVerseStart((current) => {
      if (current == null) return 1;
      return Math.min(current, verseCount);
    });
    setVerseEnd((current) => {
      if (current == null) return null;
      return Math.min(current, verseCount);
    });
  }, [verseCount, activeChapter]);

  const chapterNumbers = useMemo(() => {
    if (!focusedBook) return [];
    return Array.from({ length: focusedBook.chapters }, (_, index) => index + 1);
  }, [focusedBook]);

  const verseNumbers = useMemo(
    () => Array.from({ length: verseCount }, (_, index) => index + 1),
    [verseCount]
  );

  const normalizedChapterSelection = useMemo(() => {
    if (!chapterStart) return null;
    if (!chapterEnd) return { start: chapterStart, end: chapterStart };
    const [start, end] = normalizeChapterRange(chapterStart, chapterEnd, books);
    return { start, end };
  }, [books, chapterEnd, chapterStart]);

  const chapterCoverage = useMemo(() => {
    if (!normalizedChapterSelection) return null;
    const startBookIndex = books.findIndex((book) => book.id === normalizedChapterSelection.start.bookId);
    const endBookIndex = books.findIndex((book) => book.id === normalizedChapterSelection.end.bookId);
    const startBook = books[startBookIndex];
    const endBook = books[endBookIndex];
    if (!startBook || !endBook) return null;

    const singlePoint =
      startBook.id === endBook.id &&
      normalizedChapterSelection.start.chapter === normalizedChapterSelection.end.chapter;
    const label = singlePoint
      ? `${startBook.label} ${startBook.chapterDelineation} ${normalizedChapterSelection.start.chapter}`
      : `${startBook.label} ${normalizedChapterSelection.start.chapter} - ${endBook.label} ${normalizedChapterSelection.end.chapter}`;

    return {
      label,
      book: startBook.id,
      bookEnd: endBook.id,
      bookOrder: startBookIndex,
      bookEndOrder: endBookIndex,
      chapterStart: normalizedChapterSelection.start.chapter,
      chapterEnd: normalizedChapterSelection.end.chapter,
      resourceType: singlePoint ? ("chapter" as ResourceType) : ("chapter_range" as ResourceType),
      key: `chapter:${startBook.id}:${normalizedChapterSelection.start.chapter}:${endBook.id}:${normalizedChapterSelection.end.chapter}`,
    } satisfies CoverageSelection;
  }, [books, normalizedChapterSelection]);

  const verseCoverage = useMemo(() => {
    if (!focusedBook || verseStart == null) return null;
    const start = verseEnd == null ? verseStart : Math.min(verseStart, verseEnd);
    const end = verseEnd == null ? verseStart : Math.max(verseStart, verseEnd);
    return {
      label: start === end ? `${focusedBook.label} ${activeChapter}:${start}` : `${focusedBook.label} ${activeChapter}:${start}-${end}`,
      book: focusedBook.id,
      bookEnd: focusedBook.id,
      bookOrder: books.findIndex((book) => book.id === focusedBook.id),
      bookEndOrder: books.findIndex((book) => book.id === focusedBook.id),
      chapterStart: activeChapter,
      chapterEnd: activeChapter,
      verseStart: start,
      verseEnd: end,
      resourceType: start === end ? ("verse" as ResourceType) : ("verse_range" as ResourceType),
      key: `verse:${focusedBook.id}:${activeChapter}:${start}:${end}`,
    } satisfies CoverageSelection;
  }, [activeChapter, books, focusedBook, verseEnd, verseStart]);

  const coverage = selectionMode === "chapters" ? chapterCoverage : verseCoverage;

  function handleAddSelection() {
    setSaveState({ error: null, success: null });

    if (!coverage) {
      setSaveState({ error: "Choose a selection before adding it.", success: null });
      return;
    }

    if (pendingSelections.some((selection) => selection.key === coverage.key)) {
      setSaveState({ error: "That selection is already attached to this pending resource.", success: null });
      return;
    }

    setPendingSelections((current) => [...current, coverage]);
  }

  function handleRemoveSelection(key: string) {
    setPendingSelections((current) => current.filter((selection) => selection.key !== key));
    setSaveState({ error: null, success: null });
  }

  function handleChapterClick(chapter: number) {
    const point = focusedBook ? { bookId: focusedBook.id, chapter } : null;
    if (!point) return;
    if (!chapterStart || chapterEnd) {
      setChapterStart(point);
      setChapterEnd(null);
      return;
    }
    setChapterEnd(point);
  }

  function handleVerseClick(verse: number) {
    if (verseStart == null || verseEnd != null) {
      setVerseStart(verse);
      setVerseEnd(null);
      return;
    }
    setVerseEnd(verse);
  }

  function isChapterSelected(bookId: string, chapter: number) {
    if (!normalizedChapterSelection) return false;
    const point = { bookId, chapter };
    return (
      compareChapterPoints(point, normalizedChapterSelection.start, books) >= 0 &&
      compareChapterPoints(point, normalizedChapterSelection.end, books) <= 0
    );
  }

  function isVerseSelected(verse: number) {
    if (verseStart == null) return false;
    const start = verseEnd == null ? verseStart : Math.min(verseStart, verseEnd);
    const end = verseEnd == null ? verseStart : Math.max(verseStart, verseEnd);
    return verse >= start && verse <= end;
  }

  async function handleSave() {
    setSaveState({ error: null, success: null });

    if (pendingSelections.length === 0) {
      setSaveState({ error: "Add at least one selection before saving.", success: null });
      return;
    }
    if (!title.trim()) {
      setSaveState({ error: "Title is required.", success: null });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          volume: selectedVolume,
          title: title.trim(),
          url: url.trim() || undefined,
          description: description.trim() || undefined,
          coverages: pendingSelections.map((selection) => ({
            book: selection.book,
            bookEnd: selection.bookEnd,
            bookOrder: selection.bookOrder,
            bookEndOrder: selection.bookEndOrder,
            resourceType: selection.resourceType,
            chapterStart: selection.chapterStart,
            chapterEnd: selection.chapterEnd,
            verseStart: selection.verseStart,
            verseEnd: selection.verseEnd,
          })),
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Request failed ${res.status}`);
      }

      setTitle("");
      setUrl("");
      setDescription("");
      setPendingSelections([]);
      setSaveState({
        error: null,
        success: `Saved resource for ${pendingSelections.length} selection${pendingSelections.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setSaveState({
        error: error instanceof Error ? error.message : "Unable to save resource.",
        success: null,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
      <section className="rounded-[1.6rem] border px-4 py-4 surface-card sm:px-5">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.2fr]">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">Volumes</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {volumes.map((volume) => (
                  <SelectionPill
                    key={volume.id}
                    active={selectedVolume === volume.id}
                    onClick={() => setSelectedVolume(volume.id)}
                  >
                    {volume.label}
                  </SelectionPill>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">Books</p>
              <div className="mt-2 max-h-[30rem] space-y-2 overflow-y-auto pr-1">
                {books.map((book) => (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => setFocusedBookId(book.id)}
                    className={`flex w-full items-start justify-between rounded-2xl border px-3 py-3 text-left transition-colors ${
                      focusedBook?.id === book.id
                        ? "border-black/70 bg-black text-white dark:border-white/70 dark:bg-white dark:text-black"
                        : "border-black/10 bg-background/70 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-semibold">{book.label}</span>
                      <span className="block text-xs opacity-70">
                        {book.chapters} {book.chapterDelineation.toLowerCase()}
                        {book.chapters === 1 ? "" : "s"}
                      </span>
                    </span>
                    {selectionMode === "chapters" ? (
                      <span className="text-xs opacity-60">
                        {chapterStart?.bookId === book.id || chapterEnd?.bookId === book.id
                          ? "Selected"
                          : "Open"}
                      </span>
                    ) : (
                      <span className="text-xs opacity-60">Open</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.4rem] border border-black/10 bg-background/50 p-4 dark:border-white/15">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">Selection</p>
                  <h2 className="mt-1 text-xl font-semibold">{focusedBook?.label ?? "Choose a book"}</h2>
                  <p className="text-sm text-foreground/65">
                    {focusedBook
                      ? `${getScriptureVolumeLabel(selectedVolume)} • ${focusedBook.chapters} ${focusedBook.chapterDelineation.toLowerCase()}${focusedBook.chapters === 1 ? "" : "s"}`
                      : "Select a scripture book to begin."}
                  </p>
                </div>
                <div className="flex rounded-full border border-black/10 bg-background/80 p-1 text-sm dark:border-white/15">
                  <button
                    type="button"
                    onClick={() => setSelectionMode("chapters")}
                    className={`rounded-full px-3 py-1.5 ${selectionMode === "chapters" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
                  >
                    Chapters
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectionMode("verses")}
                    className={`rounded-full px-3 py-1.5 ${selectionMode === "verses" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
                  >
                    Verses
                  </button>
                </div>
              </div>
            </div>

            {selectionMode === "chapters" ? (
              <div className="rounded-[1.4rem] border border-black/10 bg-background/50 p-4 dark:border-white/15">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Chapter range</p>
                    <p className="text-xs text-foreground/65">
                      Click a chapter to set the start, then click any chapter in this or another book to set the end.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!focusedBook) return;
                      setChapterStart({ bookId: focusedBook.id, chapter: 1 });
                      setChapterEnd(null);
                    }}
                    className="rounded-md border border-black/10 px-2.5 py-1.5 text-xs dark:border-white/15"
                  >
                    Reset
                  </button>
                </div>

                <div className="mt-3 rounded-xl border border-black/10 bg-background/60 px-3 py-2 text-xs text-foreground/65 dark:border-white/15">
                  Start: {formatChapterPoint(chapterStart, books) || "None"} • End: {formatChapterPoint(chapterEnd, books) || "Pending"}
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                  {chapterNumbers.map((chapterNumber) => (
                    <SelectionPill
                      key={`${focusedBook?.id}-${chapterNumber}`}
                      active={focusedBook ? isChapterSelected(focusedBook.id, chapterNumber) : false}
                      onClick={() => handleChapterClick(chapterNumber)}
                    >
                      {chapterNumber}
                    </SelectionPill>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-[1.4rem] border border-black/10 bg-background/50 p-4 dark:border-white/15">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Verse range</p>
                    <p className="text-xs text-foreground/65">
                      Choose a chapter, click one verse to start, then another verse to finish the range.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveChapter((current) => Math.max(1, current - 1))}
                      className="rounded-md border border-black/10 px-2.5 py-1.5 text-xs dark:border-white/15"
                    >
                      Prev
                    </button>
                    <div className="text-sm font-medium">
                      {focusedBook?.chapterDelineation} {activeChapter}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveChapter((current) => Math.min(focusedBook?.chapters ?? current, current + 1))}
                      className="rounded-md border border-black/10 px-2.5 py-1.5 text-xs dark:border-white/15"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {chapterNumbers.map((chapterNumber) => (
                    <SelectionPill
                      key={chapterNumber}
                      active={activeChapter === chapterNumber}
                      onClick={() => setActiveChapter(chapterNumber)}
                    >
                      {chapterNumber}
                    </SelectionPill>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-black/10 bg-background/60 px-3 py-2 text-xs text-foreground/65 dark:border-white/15">
                  Verses: {formatVerseRange(verseStart, verseEnd)}
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                  {verseNumbers.map((verseNumber) => (
                    <SelectionPill
                      key={verseNumber}
                      active={isVerseSelected(verseNumber)}
                      onClick={() => handleVerseClick(verseNumber)}
                    >
                      {verseNumber}
                    </SelectionPill>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="rounded-[1.6rem] border px-4 py-4 surface-card sm:px-5">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">Attach Resource</p>
            <h2 className="mt-1 text-xl font-semibold">Resource details</h2>
            <p className="text-sm text-foreground/65">
              Add one or more selections to the pending resource, then save once.
            </p>
          </div>

          <div className="rounded-[1.2rem] border border-black/10 bg-background/50 p-4 dark:border-white/15">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/50">Current selection</p>
                <p className="mt-2 text-base font-semibold">{coverage?.label ?? "No selection"}</p>
                <p className="mt-1 text-sm text-foreground/65">
                  {selectionMode === "chapters"
                    ? `Start ${formatChapterPoint(chapterStart, books) || "None"} • End ${formatChapterPoint(chapterEnd, books) || "Pending"}`
                    : `${focusedBook?.label ?? ""} ${activeChapter}:${formatVerseRange(verseStart, verseEnd)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddSelection}
                disabled={!coverage}
                className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15"
              >
                Add selection
              </button>
            </div>
          </div>

          <div className="rounded-[1.2rem] border border-black/10 bg-background/50 p-4 dark:border-white/15">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/50">Pending coverage</p>
            {pendingSelections.length === 0 ? (
              <p className="mt-2 text-sm text-foreground/65">No selections added yet.</p>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pendingSelections.map((selection) => (
                    <span
                      key={selection.key}
                      className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-background/70 px-3 py-1.5 text-xs dark:border-white/15"
                    >
                      <span>{selection.label}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSelection(selection.key)}
                        className="rounded-full border border-black/10 px-1.5 py-0.5 text-[11px] dark:border-white/15"
                        aria-label={`Remove ${selection.label}`}
                      >
                        Remove
                      </button>
                    </span>
                  ))}
                </div>

                <ul className="mt-3 space-y-2">
                  {pendingSelections.map((selection) => (
                    <li
                      key={`${selection.key}-row`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-background/60 px-3 py-2 text-sm dark:border-white/15"
                    >
                      <span>{selection.label}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSelection(selection.key)}
                        className="text-xs underline underline-offset-2"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Resource title"
              className="w-full rounded-xl border border-black/10 bg-background/70 px-3 py-2.5 text-sm dark:border-white/15"
            />
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="URL (optional)"
              className="w-full rounded-xl border border-black/10 bg-background/70 px-3 py-2.5 text-sm dark:border-white/15"
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description (optional)"
              rows={5}
              className="w-full rounded-xl border border-black/10 bg-background/70 px-3 py-2.5 text-sm dark:border-white/15"
            />
          </div>

          {saveState.error ? <p className="text-sm text-red-600">{saveState.error}</p> : null}
          {saveState.success ? <p className="text-sm text-green-700 dark:text-green-400">{saveState.success}</p> : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={submitting || pendingSelections.length === 0}
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black"
          >
            {submitting ? "Saving..." : `Attach resource${pendingSelections.length > 0 ? ` (${pendingSelections.length})` : ""}`}
          </button>
        </div>
      </aside>
    </div>
  );
}
