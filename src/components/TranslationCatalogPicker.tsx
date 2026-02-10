"use client";

import { useMemo, useState } from "react";
import type { HelloaoTranslation } from "@/lib/helloaoApi";

type Props = {
  existingIds: string[];
  onAddFavorite: (translation: { id: string; label: string; language?: string }) => void;
};

type CatalogResponse = {
  ok: boolean;
  translations?: HelloaoTranslation[];
  error?: string;
};

function buildTranslationLabel(item: HelloaoTranslation): string {
  const english = item.englishName?.trim();
  const primary = item.name?.trim();
  if (english && primary && english !== primary) return `${english} (${primary})`;
  return english || primary || item.id;
}

export default function TranslationCatalogPicker({ existingIds, onAddFavorite }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<HelloaoTranslation[]>([]);

  const existingSet = useMemo(
    () => new Set(existingIds.map((id) => id.trim().toLowerCase())),
    [existingIds]
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const source = normalizedQuery
      ? catalog.filter((item) => {
          return (
            item.id.toLowerCase().includes(normalizedQuery) ||
            (item.name ?? "").toLowerCase().includes(normalizedQuery) ||
            (item.englishName ?? "").toLowerCase().includes(normalizedQuery) ||
            (item.languageEnglishName ?? "").toLowerCase().includes(normalizedQuery)
          );
        })
      : catalog;
    return source.slice(0, 40);
  }, [catalog, query]);

  async function handleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen || catalog.length > 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/helloao/translations", { cache: "no-store" });
      const data = (await res.json()) as CatalogResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setCatalog(Array.isArray(data.translations) ? data.translations : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load translation catalog");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/10"
      >
        {open ? "Hide additional translations" : "Search additional translations"}
      </button>

      {open ? (
        <div className="rounded-md border border-black/10 dark:border-white/15 p-2 space-y-2">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, id, or language"
            className="w-full rounded-md border border-black/10 dark:border-white/15 bg-background px-2 py-1.5 text-xs"
          />
          {loading ? <div className="text-xs text-foreground/60">Loading translation catalog...</div> : null}
          {error ? <div className="text-xs text-red-600 dark:text-red-300">{error}</div> : null}

          {!loading && !error ? (
            <div className="max-h-64 overflow-auto space-y-1">
              {filtered.length === 0 ? (
                <div className="text-xs text-foreground/60">No translations matched your search.</div>
              ) : (
                filtered.map((item) => {
                  const alreadyAdded = existingSet.has(item.id.toLowerCase());
                  return (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-black/10 dark:border-white/15 p-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium">{item.id}</div>
                        <div className="text-[11px] text-foreground/70">{buildTranslationLabel(item)}</div>
                        <div className="text-[10px] text-foreground/60">
                          {item.languageEnglishName || item.language || "Unknown language"}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() =>
                          onAddFavorite({
                            id: item.id,
                            label: buildTranslationLabel(item),
                            language: item.languageEnglishName || item.language,
                          })
                        }
                        className="shrink-0 rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-[10px] uppercase tracking-wide disabled:opacity-50"
                      >
                        {alreadyAdded ? "Added" : "Add"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
