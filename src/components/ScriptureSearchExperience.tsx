"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, useDeferredValue } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  loadLocalScriptureStore,
  searchLocalScriptures,
  type LocalScriptureReferenceResult,
  type LocalScriptureSearchResults,
  type LocalScriptureVerseResult,
  type SearchStoreStatus,
} from "@/lib/localScriptureSearch";

const MIN_QUERY_LENGTH = 2;
const EMPTY_RESULTS: LocalScriptureSearchResults = { referenceResults: [], verseResults: [] };

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

function highlightText(text: string, query: string) {
  const terms = Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .filter((term) => term.length >= MIN_QUERY_LENGTH)
    )
  );
  if (terms.length === 0) return text;

  const splitter = new RegExp(`(${terms.join("|")})`, "gi");
  const matcher = new RegExp(`^(${terms.join("|")})$`, "i");
  const parts = text.split(splitter);
  return parts.map((part, index) =>
    matcher.test(part) ? (
      <mark
        key={`${part}-${index}`}
        className="rounded-sm bg-amber-300/70 px-0.5 text-current dark:bg-amber-400/30"
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    )
  );
}

function ReferenceResultCard({ result }: { result: LocalScriptureReferenceResult }) {
  return (
    <li>
      <Link
        href={result.href}
        className="group block rounded-[1.35rem] border p-4 transition-colors surface-card hover:bg-[var(--surface-button-hover)] sm:p-5"
        data-tap
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/46">
              {result.volumeTitle}
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">{result.label}</h2>
          </div>
          <div className="rounded-full border px-2.5 py-1 text-xs text-foreground/58">
            {result.verseNumber ? "Direct verse" : "Direct chapter"}
          </div>
        </div>
        <p className="mt-3 text-sm leading-7 text-foreground/78">
          Jump straight to {result.label} in the reader.
        </p>
        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-xs text-foreground/52">
          <span>
            Chapter {result.chapterNumber}
            {result.verseNumber ? `, verse ${result.verseNumber}` : ""}
          </span>
          <span className="font-medium text-foreground/68 transition-transform duration-200 group-hover:translate-x-0.5">
            Open reference
          </span>
        </div>
      </Link>
    </li>
  );
}

function VerseResultCard({ result, query }: { result: LocalScriptureVerseResult; query: string }) {
  return (
    <li>
      <Link
        href={result.href}
        className="group block rounded-[1.35rem] border p-4 transition-colors surface-card hover:bg-[var(--surface-button-hover)] sm:p-5"
        data-tap
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/46">
              {result.volumeTitle}
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">
              {highlightText(result.reference, query)}
            </h2>
          </div>
          <div className="rounded-full border px-2.5 py-1 text-xs text-foreground/58">
            {result.matchCount} hit{result.matchCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="mt-3 space-y-3">
          {result.snippets.map((snippet) => (
            <p key={`${result.id}:${snippet.verseNumber}`} className="text-sm leading-7 text-foreground/78">
              <span className="mr-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/48">
                Verse {snippet.verseNumber}
              </span>
              {highlightText(snippet.snippet, query)}
            </p>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-xs text-foreground/52">
          <span>
            Matched verses {result.verseLabel}
          </span>
          <span className="font-medium text-foreground/68 transition-transform duration-200 group-hover:translate-x-0.5">
            Open chapter
          </span>
        </div>
      </Link>
    </li>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="rounded-[1.35rem] border p-4 surface-card">
          <div className="h-3 w-24 rounded bg-foreground/10" />
          <div className="mt-3 h-5 w-40 rounded bg-foreground/12" />
          <div className="mt-4 h-3 w-full rounded bg-foreground/8" />
          <div className="mt-2 h-3 w-11/12 rounded bg-foreground/8" />
          <div className="mt-2 h-3 w-4/5 rounded bg-foreground/8" />
        </div>
      ))}
    </div>
  );
}

export default function ScriptureSearchExperience() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const [storeStatus, setStoreStatus] = useState<SearchStoreStatus>("idle");
  const [results, setResults] = useState<LocalScriptureSearchResults>(EMPTY_RESULTS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultState, setResultState] = useState<"idle" | "searching" | "done">("idle");
  const [isOffline, setIsOffline] = useState(false);
  const [, startNavigationTransition] = useTransition();
  const [isSearching, startSearchTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsOffline(!window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setStoreStatus("loading");
    setErrorMessage(null);

    loadLocalScriptureStore()
      .then(() => {
        if (!active) return;
        setStoreStatus("ready");
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStoreStatus("error");
        const fallback = isOffline
          ? "The scripture store has not been cached on this device yet. Connect once to load it for offline search."
          : "The scripture store could not be loaded. Try again in a moment.";
        setErrorMessage(error instanceof Error ? `${fallback}` : fallback);
      });

    return () => {
      active = false;
    };
  }, [isOffline]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (query.trim()) nextParams.set("q", query.trim());
    else nextParams.delete("q");
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    if (nextUrl === currentUrl) return;
    startNavigationTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }, [pathname, query, router, searchParams]);

  useEffect(() => {
    const trimmed = deferredQuery.trim();
    if (storeStatus !== "ready") {
      setResults(EMPTY_RESULTS);
      return;
    }
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(EMPTY_RESULTS);
      setResultState("idle");
      return;
    }

    let active = true;
    setResultState("searching");
    startSearchTransition(() => {
      searchLocalScriptures(trimmed)
        .then((nextResults) => {
          if (!active) return;
          setResults(nextResults);
          setResultState("done");
          setErrorMessage(null);
        })
        .catch(() => {
          if (!active) return;
          setResults(EMPTY_RESULTS);
          setResultState("done");
          setErrorMessage(
            isOffline
              ? "Search is unavailable offline until the local scripture store has been loaded once."
              : "Search failed while reading the local scripture store."
          );
        });
    });

    return () => {
      active = false;
    };
  }, [deferredQuery, isOffline, storeStatus]);

  const totalResults = results.referenceResults.length + results.verseResults.length;

  const helperText = useMemo(() => {
    const trimmed = query.trim();
    if (storeStatus === "loading") return "Loading the local scripture library for offline search.";
    if (trimmed.length === 0) return "Search references like Alma 32 or D&C 4:3, or search verse text across the bundled store.";
    if (trimmed.length < MIN_QUERY_LENGTH) return "Enter at least 2 characters to search.";
    if (totalResults === 0) return "No references or verses matched that search.";
    return null;
  }, [query, storeStatus, totalResults]);

  const showSkeleton = storeStatus === "loading" || (resultState === "searching" && totalResults === 0);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      {isOffline ? (
        <div className="flex flex-wrap items-center gap-2">
          {isOffline ? (
            <div className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-amber-900 dark:text-amber-200">
              Offline
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="surface-card-strong rounded-[1.75rem] border p-5 sm:p-6">
        <label
          htmlFor="scripture-search-input"
          className="flex items-center gap-3 rounded-[1.2rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] px-4 py-3"
        >
          <div className="text-foreground/55">
            <SearchIcon />
          </div>
          <input
            ref={inputRef}
            id="scripture-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                inputRef.current?.blur();
              }
            }}
            placeholder="Try faith, Alma 32, mercy, or Joseph Smith"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/45"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {errorMessage ?? helperText ? <p className="text-sm text-foreground/62">{errorMessage ?? helperText}</p> : null}
        </div>
      </div>

      {storeStatus === "error" ? (
        <div className="rounded-[1.5rem] border border-amber-500/35 bg-amber-500/8 p-5 text-sm leading-7 text-foreground/76">
          {errorMessage}
        </div>
      ) : null}

      {showSkeleton ? <LoadingSkeleton /> : null}

      {!showSkeleton && totalResults > 0 ? (
        <div className="space-y-6">
          {results.referenceResults.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground/52">Reference Matches</h2>
                <div className="text-xs text-foreground/52">Jump straight to the passage</div>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {results.referenceResults.map((result) => (
                  <ReferenceResultCard key={result.id} result={result} />
                ))}
              </ul>
            </section>
          ) : null}

          {results.verseResults.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground/52">Verse Text Matches</h2>
                <div className="text-xs text-foreground/52">Local full-text results</div>
              </div>
              <ul className="grid gap-3 sm:gap-4">
                {results.verseResults.map((result) => (
                  <VerseResultCard key={result.id} result={result} query={deferredQuery} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {!showSkeleton && storeStatus === "ready" && totalResults === 0 && query.trim().length >= MIN_QUERY_LENGTH ? (
        <div className="rounded-[1.5rem] border p-5 text-sm leading-7 text-foreground/72 surface-card">
          No references or verses matched <span className="font-medium text-foreground">{query.trim()}</span>. Try a shorter phrase, a book name, or a reference like <span className="font-medium text-foreground">Alma 32</span> or <span className="font-medium text-foreground">D&C 4:3</span>.
        </div>
      ) : null}

      {!showSkeleton && query.trim().length < MIN_QUERY_LENGTH ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.25rem] border p-4 surface-card">
            <div className="text-sm font-medium">Reference Search</div>
            <p className="mt-1 text-sm text-foreground/68">Find direct references like Alma 32, Genesis 1, or D&C 4:3.</p>
          </div>
          <div className="rounded-[1.25rem] border p-4 surface-card">
            <div className="text-sm font-medium">Phrase Search</div>
            <p className="mt-1 text-sm text-foreground/68">Search verse text locally without needing a network round trip.</p>
          </div>
          <div className="rounded-[1.25rem] border p-4 surface-card">
            <div className="text-sm font-medium">Offline Resume</div>
            <p className="mt-1 text-sm text-foreground/68">Once the bundled store has loaded on a device, the browser can reuse it when you are offline.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
