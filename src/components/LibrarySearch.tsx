"use client";

import { useId, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useChapterNavigation } from "@/components/ChapterNavigation";
import { getQuickNavSuggestions, parseScriptureReferenceQuery } from "@/lib/scriptureQuickNav";

type Option = { key: string; label: string; href: string; kind: "jump" | "search" };

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="5.5" />
      <path d="m15.2 15.2 4.3 4.3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function searchHref(query: string): string {
  const trimmed = query.trim();
  return trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search";
}

/**
 * The Library's one search box: references jump straight to a chapter, anything else searches
 * every scripture. It is a plain GET form, so Enter still reaches /search without JavaScript.
 */
export default function LibrarySearch({ className = "" }: { className?: string }) {
  // A jump to a chapter shows its page at once; /search and other hrefs go through the router as usual.
  const navigate = useChapterNavigation();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const options = useMemo<Option[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const jumps: Option[] = getQuickNavSuggestions(trimmed, 6).map((item) => ({
      key: item.key,
      label: item.label,
      href: item.href,
      kind: "jump",
    }));
    const search: Option = {
      key: "search",
      label: `Search scriptures for “${trimmed}”`,
      href: searchHref(trimmed),
      kind: "search",
    };
    // Only a valid parsed reference makes Enter jump; invalid refs and plain words search first.
    return parseScriptureReferenceQuery(trimmed, 1).length > 0 ? [...jumps, search] : [search, ...jumps];
  }, [query]);

  const expanded = open && options.length > 0;
  const activeOption = expanded ? options[Math.min(active, options.length - 1)] : undefined;
  const optionId = (key: string) => `${listId}-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  function go(href: string) {
    navigate(href);
    setOpen(false);
    setQuery("");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go(activeOption?.href ?? options[0]?.href ?? searchHref(query));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (open ? (current + step + options.length) % options.length : 0));
      setOpen(true);
    } else if (event.key === "Escape") {
      // Chrome clears type="search" inputs on Escape; keep the query while closing suggestions.
      event.preventDefault();
      if (expanded) setOpen(false);
      else setQuery("");
    }
  }

  return (
    <form role="search" action="/search" method="get" onSubmit={onSubmit} className={`relative min-w-0 ${className}`.trim()}>
      <label className="soft-input flex h-9 items-center gap-2 px-3 text-[color:var(--foreground-muted)] focus-within:ring-2 focus-within:ring-amber-500/30">
        <SearchIcon />
        <input
          type="search"
          name="q"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="Search or jump to 1 Ne 3:7"
          aria-label="Search scriptures or jump to a reference"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={activeOption ? optionId(activeOption.key) : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-[color:var(--foreground-soft)]"
        />
      </label>
      {expanded ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search and jump options"
          className="absolute inset-x-0 top-full z-40 mt-2 max-h-[22rem] overflow-y-auto rounded-lg border border-[color:var(--surface-border)] bg-background p-1.5 shadow-xl"
        >
          {options.map((option) => (
            <li
              key={option.key}
              id={optionId(option.key)}
              role="option"
              aria-selected={option === activeOption}
              // Keep focus in the input so blur does not close the list before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(options.indexOf(option))}
              onClick={() => go(option.href)}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm ${
                option === activeOption ? "bg-[color:var(--surface-button-hover)]" : ""
              }`}
            >
              <span className="text-[color:var(--foreground-soft)]">
                {option.kind === "search" ? <SearchIcon /> : <ArrowIcon />}
              </span>
              <span className="min-w-0 truncate">{option.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
