"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type VolumeBookBrowserItem = {
  id: string;
  label: string;
  chapters?: number;
  category?: string;
};

type Props = {
  books: VolumeBookBrowserItem[];
  volumeLabel: string;
  volumeSlug: string;
  lessonSuffix?: string;
};

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="5.5" />
      <path d="m15.2 15.2 4.3 4.3" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export default function VolumeBookBrowser({
  books,
  volumeLabel,
  volumeSlug,
  lessonSuffix = "",
}: Props) {
  const [query, setQuery] = useState("");

  const filteredBooks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return books;
    return books.filter((book) => {
      const haystack = [book.label, book.category, book.id].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(normalized);
    });
  }, [books, query]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 sm:gap-6">
      <label className="flex items-center gap-3 rounded-[1.35rem] border px-4 py-3 text-sm surface-card-soft">
        <span className="text-foreground/55">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for a book or passage..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-foreground/45"
          aria-label={`Search books in ${volumeLabel}`}
        />
      </label>

      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em] sm:text-[1.9rem]">
          {volumeLabel}
        </h1>
        <div className="pb-1 text-xs font-medium uppercase tracking-[0.14em] text-foreground/45">
          {filteredBooks.length} books
        </div>
      </div>

      {filteredBooks.length === 0 ? (
        <div className="rounded-[1.5rem] border px-5 py-10 text-center text-sm surface-card-soft">
          No books matched your search.
        </div>
      ) : (
        <ul className="space-y-4">
          {filteredBooks.map((book) => (
            <li key={book.id}>
              <Link
                href={`/browse/${volumeSlug}/${book.id}${lessonSuffix}`}
                className="group block rounded-[1.35rem] border px-4 py-4 transition-all duration-200 surface-card"
                data-tap
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    {book.category ? (
                      <div className="mb-2 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-foreground/42">
                        {book.category}
                      </div>
                    ) : null}
                    <div className="text-[1.4rem] font-semibold leading-none tracking-[-0.025em] text-foreground sm:text-[1.55rem]">
                      {book.label}
                    </div>
                    {book.chapters ? (
                      <div className="mt-2 text-sm text-foreground/58">
                        {book.chapters} {book.chapters === 1 ? "chapter" : "chapters"}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-foreground/34 transition-transform duration-200 group-hover:translate-x-0.5">
                    <ChevronIcon />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
