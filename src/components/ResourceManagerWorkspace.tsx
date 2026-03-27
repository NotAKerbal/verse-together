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

const VOLUME_ABBREVIATIONS: Record<string, string> = {
  bookofmormon: "BofM",
  oldtestament: "OT",
  newtestament: "NT",
  doctrineandcovenants: "D&C",
  pearl: "PGP",
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
      data-active={active ? "true" : "false"}
      className="surface-button rounded-full border px-3 py-2 text-sm font-medium"
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

function summarizeCoverage(coverage: CoverageSelection | null, selectionMode: SelectionMode, books: LocalBrowseBook[]) {
  if (!coverage) return "Choose a selection to preview coverage details.";
  if (selectionMode === "chapters") {
    return `Start ${formatChapterPoint({ bookId: coverage.book, chapter: coverage.chapterStart }, books)} • End ${formatChapterPoint({ bookId: coverage.bookEnd, chapter: coverage.chapterEnd }, books)}`;
  }
  return `${coverage.label} • verses ${formatVerseRange(coverage.verseStart ?? null, coverage.verseEnd ?? null)}`;
}

function getVolumeAbbreviation(volumeId: string, fallback: string) {
  return VOLUME_ABBREVIATIONS[volumeId] ?? fallback;
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
  const [bookQuery, setBookQuery] = useState("");
  const [pendingSelections, setPendingSelections] = useState<CoverageSelection[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ error: null, success: null });

  useEffect(() => {
    const nextBookId = books[0]?.id ?? "";
    setFocusedBookId(nextBookId);
    setBookQuery("");
    setActiveChapter(1);
    setChapterStart(nextBookId ? { bookId: nextBookId, chapter: 1 } : null);
    setChapterEnd(null);
    setVerseStart(1);
    setVerseEnd(null);
    setPendingSelections([]);
    setSaveState({ error: null, success: null });
  }, [books]);

  const visibleBooks = useMemo(() => {
    const query = bookQuery.trim().toLowerCase();
    if (!query) return books;
    return books.filter((book) => book.label.toLowerCase().includes(query));
  }, [bookQuery, books]);

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
    <div className="grid gap-4 xl:h-full xl:grid-cols-[20rem_minmax(0,1fr)_25rem] xl:overflow-hidden">
      <aside className="panel-card rounded-[1.6rem] p-4 sm:p-5 xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden xl:p-0">
        <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          <div className="space-y-4 xl:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="page-eyebrow">Step 1</p>
              <h2 className="text-base font-semibold tracking-tight">Scope</h2>
            </div>
            <div className="page-meta">{books.length} books</div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-2">
              {volumes.map((volume) => (
                <SelectionPill
                  key={volume.id}
                  active={selectedVolume === volume.id}
                  onClick={() => setSelectedVolume(volume.id)}
                >
                  {getVolumeAbbreviation(volume.id, volume.label)}
                </SelectionPill>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2 rounded-[1.2rem] border surface-card-soft p-1">
              <button
                type="button"
                onClick={() => setSelectionMode("chapters")}
                data-active={selectionMode === "chapters" ? "true" : "false"}
                className="surface-button rounded-[0.95rem] border px-3 py-2 text-sm font-medium"
              >
                Chapters
              </button>
              <button
                type="button"
                onClick={() => setSelectionMode("verses")}
                data-active={selectionMode === "verses" ? "true" : "false"}
                className="surface-button rounded-[0.95rem] border px-3 py-2 text-sm font-medium"
              >
                Verses
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">Books</p>
              <span className="text-xs text-foreground/55">
                {visibleBooks.length}/{books.length}
              </span>
            </div>
            <input
              value={bookQuery}
              onChange={(event) => setBookQuery(event.target.value)}
              placeholder="Filter books..."
              className="soft-input w-full px-3 py-2 text-sm outline-none"
            />
            <div className="space-y-1">
              {visibleBooks.length === 0 ? (
                <div className="rounded-[1rem] border border-dashed surface-card-soft px-3 py-4 text-sm text-foreground/60">
                  No books match this filter.
                </div>
              ) : (
                visibleBooks.map((book) => {
                  const isFocused = focusedBook?.id === book.id;
                  const hasBoundary =
                    selectionMode === "chapters" &&
                    (chapterStart?.bookId === book.id || chapterEnd?.bookId === book.id);
                  return (
                    <button
                      key={book.id}
                      type="button"
                      onClick={() => setFocusedBookId(book.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-[1.1rem] border px-3 py-2.5 text-left transition-colors ${
                        isFocused
                          ? "border-[color:var(--surface-button-active)] bg-[color:var(--surface-button-active)] text-[color:var(--surface-button-active-text)]"
                          : "surface-card-soft hover:bg-[color:var(--surface-button-hover)]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{book.label}</span>
                        <span className="block text-xs opacity-70">
                          {book.chapters} {book.chapterDelineation.toLowerCase()}
                          {book.chapters === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] opacity-60">
                        {hasBoundary ? "Marked" : isFocused ? "Open" : "View"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          </div>
        </div>
      </aside>

      <section className="space-y-4 xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden">
        <div className="panel-card-strong rounded-[1.7rem] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <p className="page-eyebrow">Step 2</p>
                <div className="page-meta">{selectionMode === "chapters" ? "Chapters" : "Verses"}</div>
              </div>
              <div>
                <h2 className="text-[1.45rem] font-semibold tracking-[-0.03em]">
                  {focusedBook?.label ?? "Choose a book"}
                </h2>
                <p className="text-xs text-[color:var(--foreground-muted)]">
                  {focusedBook
                    ? `${getScriptureVolumeLabel(selectedVolume)} • ${focusedBook.chapters} ${focusedBook.chapterDelineation.toLowerCase()}${focusedBook.chapters === 1 ? "" : "s"}`
                    : "Select a book to start defining coverage."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="page-meta">{pendingSelections.length} pending</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="browse-summary-card">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">Selection</p>
              <p className="mt-1.5 text-base font-semibold">{coverage?.label ?? "No selection yet"}</p>
              <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
                {summarizeCoverage(coverage, selectionMode, books)}
              </p>
            </div>

            <div className="panel-card-soft rounded-[1.35rem] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">Reset</p>
              <button
                type="button"
                onClick={() => {
                  if (!focusedBook) return;
                  if (selectionMode === "chapters") {
                    setChapterStart({ bookId: focusedBook.id, chapter: 1 });
                    setChapterEnd(null);
                    return;
                  }
                  setVerseStart(1);
                  setVerseEnd(null);
                }}
                className="surface-button mt-2 w-full rounded-full border px-3 py-2 text-sm"
              >
                Reset selection
              </button>
            </div>
          </div>
        </div>

        <div className="panel-card rounded-[1.7rem] xl:min-h-0 xl:flex-1 xl:overflow-hidden">
          <div className="xl:h-full xl:overflow-y-auto">
            <div className="p-5 sm:p-6">
              {selectionMode === "chapters" ? (
                <div>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <h3 className="text-lg font-semibold">Chapter range</h3>
                    <div className="rounded-full border surface-card-soft px-4 py-2 text-xs text-foreground/65">
                      {formatChapterPoint(chapterStart, books) || "None"} • {formatChapterPoint(chapterEnd, books) || "Pending"}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
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
                <div>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <h3 className="text-lg font-semibold">Verse range</h3>
                    <div className="flex items-center gap-2 rounded-full border surface-card-soft px-2 py-2">
                      <button
                        type="button"
                        onClick={() => setActiveChapter((current) => Math.max(1, current - 1))}
                        className="surface-button rounded-full border px-3 py-1.5 text-xs"
                      >
                        Prev
                      </button>
                      <span className="min-w-[7rem] text-center text-sm font-semibold">
                        {focusedBook?.chapterDelineation} {activeChapter}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveChapter((current) => Math.min(focusedBook?.chapters ?? current, current + 1))}
                        className="surface-button rounded-full border px-3 py-1.5 text-xs"
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[1.3rem] border surface-card-soft p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">Chapter</p>
                      <p className="text-xs text-foreground/60">{formatVerseRange(verseStart, verseEnd) || "No verses"}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
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
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
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
        </div>
      </section>

      <aside className="panel-card rounded-[1.6rem] p-4 sm:p-5 xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden xl:p-0">
        <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          <div className="space-y-4 xl:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="page-eyebrow">Step 3</p>
                <h2 className="text-base font-semibold tracking-tight">Attach</h2>
              </div>
              <div className="page-meta">{pendingSelections.length} queued</div>
            </div>

            <div className="browse-summary-card">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">Ready</p>
              <p className="mt-1.5 text-base font-semibold">{coverage?.label ?? "No selection"}</p>
              <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
                {summarizeCoverage(coverage, selectionMode, books)}
              </p>
              <button
                type="button"
                onClick={handleAddSelection}
                disabled={!coverage}
                className="mt-4 w-full rounded-[1rem] bg-[color:var(--browse-ink)] px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black"
              >
                Add selection
              </button>
            </div>

            <div className="panel-card-soft rounded-[1.35rem] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">Pending</p>
                <span className="text-xs text-foreground/55">{pendingSelections.length}</span>
              </div>
              {pendingSelections.length === 0 ? (
                <p className="mt-3 text-sm text-[color:var(--foreground-muted)]">No selections yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {pendingSelections.map((selection, index) => (
                    <li
                      key={selection.key}
                      className="flex items-start justify-between gap-3 rounded-[1rem] border bg-[color:var(--surface-card)] px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium">{selection.label}</p>
                        <p className="mt-1 text-xs text-foreground/60">#{index + 1}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSelection(selection.key)}
                        className="surface-button rounded-full border px-2.5 py-1 text-[11px]"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title"
                className="soft-input w-full px-3 py-3 text-sm outline-none"
              />
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="URL"
                className="soft-input w-full px-3 py-3 text-sm outline-none"
              />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description"
                rows={5}
                className="soft-input w-full px-3 py-3 text-sm outline-none"
              />
            </div>

            {saveState.error ? <p className="text-sm text-red-600">{saveState.error}</p> : null}
            {saveState.success ? <p className="text-sm text-green-700 dark:text-green-400">{saveState.success}</p> : null}

            <button
              type="button"
              onClick={handleSave}
              disabled={submitting || pendingSelections.length === 0}
              className="w-full rounded-[1rem] bg-black px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {submitting ? "Saving..." : `Attach resource${pendingSelections.length > 0 ? ` (${pendingSelections.length})` : ""}`}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
