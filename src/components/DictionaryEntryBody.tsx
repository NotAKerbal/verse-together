"use client";
import { useEffect, useMemo, useState, type MouseEvent } from "react";

import { formatDictionaryMarkup } from "@/lib/dictionaryFormatting";

type DictionaryEntry = {
  id: string;
  edition: "1828" | "1844" | "1913";
  word: string;
  heading: string | null;
  entryText: string;
  pronounce: string | null;
};

const DEFAULT_PROVIDER_LABELS: Record<"1828" | "1844" | "1913", string> = {
  "1828": "Merriam-Webster",
  "1844": "Unavailable",
  "1913": "Free Dictionary API",
};

export default function DictionaryEntryBody({ entryText }: { entryText: string }) {
  const html = formatDictionaryMarkup(entryText);
  const [seeTerm, setSeeTerm] = useState<string | null>(null);
  const [loadingSeeTerm, setLoadingSeeTerm] = useState(false);
  const [seeError, setSeeError] = useState<string | null>(null);
  const [providerLabels, setProviderLabels] = useState(DEFAULT_PROVIDER_LABELS);
  const [seeEntries, setSeeEntries] = useState<Record<"1828" | "1844" | "1913", DictionaryEntry[]>>({
    "1828": [],
    "1844": [],
    "1913": [],
  });

  useEffect(() => {
    if (!seeTerm) return;
    let cancelled = false;
    setLoadingSeeTerm(true);
    setSeeError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/tools/dictionary?term=${encodeURIComponent(seeTerm)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Lookup request failed");
        const json = await res.json();
        if (!json.ok) throw new Error("Lookup unavailable");
        if (cancelled) return;
        const byEdition = json?.byEdition ?? {};
        setProviderLabels((json?.providerLabels ?? DEFAULT_PROVIDER_LABELS) as typeof DEFAULT_PROVIDER_LABELS);
        setSeeEntries({
          "1828": (byEdition["1828"]?.entries ?? []) as DictionaryEntry[],
          "1844": (byEdition["1844"]?.entries ?? []) as DictionaryEntry[],
          "1913": (byEdition["1913"]?.entries ?? []) as DictionaryEntry[],
        });
      } catch {
        if (cancelled) return;
        setSeeError("Unable to load dictionary entry.");
        setSeeEntries({ "1828": [], "1844": [], "1913": [] });
      } finally {
        if (!cancelled) setLoadingSeeTerm(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seeTerm]);

  const hasSeeResults = useMemo(
    () => seeEntries["1828"].length > 0 || seeEntries["1844"].length > 0 || seeEntries["1913"].length > 0,
    [seeEntries]
  );

  if (!html) return null;

  function tryHandleSeeAnchor(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false;
    const element = target instanceof HTMLElement ? target : target.parentElement;
    if (!element) return false;
    const seeAnchor = element.closest("a.dict-see-ref") as HTMLAnchorElement | null;
    if (!seeAnchor) return false;
    const rawTerm = (seeAnchor.getAttribute("data-dict-term") || seeAnchor.textContent || "").trim();
    if (!rawTerm) return false;
    if (rawTerm !== seeTerm) {
      setLoadingSeeTerm(true);
      setSeeError(null);
    }
    setSeeTerm(rawTerm);
    return true;
  }

  function handleEntryClick(event: MouseEvent<HTMLDivElement>) {
    const handled = tryHandleSeeAnchor(event.target);
    if (handled) event.preventDefault();
  }

  return (
    <>
      <div
        onClick={handleEntryClick}
        className="prose prose-sm dark:prose-invert max-w-none leading-6 prose-p:my-2 prose-blockquote:my-2 prose-blockquote:text-foreground/90 prose-mark:bg-amber-300/40 dark:prose-mark:bg-amber-400/30 prose-mark:px-1 prose-mark:rounded-sm [&_.dict-pos]:text-[0.72rem] [&_.dict-pos]:uppercase [&_.dict-pos]:tracking-wide [&_.dict-pos]:text-foreground/70 [&_.dict-col]:font-semibold [&_.dict-cd]:text-foreground/90 [&_.dict-cite]:italic [&_.dict-cite]:text-foreground/60 [&_.dict-sd]:font-semibold [&_ol.dict-ol]:my-3 [&_ol.dict-ol]:pl-6 [&_ol.dict-ol]:list-decimal [&_ul.dict-ul]:my-3 [&_ul.dict-ul]:pl-6 [&_ul.dict-ul]:list-disc [&_li]:my-1 [&_a.dict-see-ref]:underline [&_a.dict-see-ref]:decoration-dotted [&_a.dict-see-ref]:text-foreground [&_a.dict-see-ref]:cursor-pointer [&_a.dict-link-chip]:inline-flex [&_a.dict-link-chip]:items-center [&_a.dict-link-chip]:gap-1 [&_a.dict-link-chip]:rounded-full [&_a.dict-link-chip]:border [&_a.dict-link-chip]:border-sky-500/40 [&_a.dict-link-chip]:bg-sky-500/10 [&_a.dict-link-chip]:px-2 [&_a.dict-link-chip]:py-0.5 [&_a.dict-link-chip]:text-sky-700 [&_a.dict-link-chip]:no-underline dark:[&_a.dict-link-chip]:border-sky-300/40 dark:[&_a.dict-link-chip]:bg-sky-300/10 dark:[&_a.dict-link-chip]:text-sky-300 [&_.dict-link-icon]:text-[0.72em] [&_.dict-link-icon]:opacity-80"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {seeTerm ? (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={() => setSeeTerm(null)}>
          <div
            className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-xl border border-[color:var(--surface-border)] bg-background p-4 sm:p-5"
            onClick={(event) => {
              event.stopPropagation();
              const handled = tryHandleSeeAnchor(event.target);
              if (handled) event.preventDefault();
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <h4 className="text-base font-semibold">See: {seeTerm}</h4>
              <button
                type="button"
                onClick={() => setSeeTerm(null)}
                className="px-2.5 py-1 text-sm rounded-md border border-[color:var(--surface-border)]"
              >
                Close
              </button>
            </div>

            {loadingSeeTerm ? <div className="text-sm text-foreground/70">Loading...</div> : null}
            {!loadingSeeTerm && seeError ? <div className="text-sm text-red-600 dark:text-red-400">{seeError}</div> : null}
            {!loadingSeeTerm && !seeError && !hasSeeResults ? (
              <div className="text-sm text-foreground/70">No dictionary entry found.</div>
            ) : null}

            {!loadingSeeTerm && !seeError && hasSeeResults ? (
              <div className="space-y-3">
                {(["1828", "1844", "1913"] as const)
                  .map((edition) => ({ edition, rows: seeEntries[edition] }))
                  .filter((group) => group.rows.length > 0)
                  .map((group) => (
                    <section key={group.edition} className="space-y-2">
                      <h5 className="text-xs font-semibold tracking-wide text-foreground/60">
                        {providerLabels[group.edition] || "Dictionary Source"}
                      </h5>
                      {group.rows.map((entry) => (
                        <article key={entry.id} className="rounded-md border border-[color:var(--surface-border)] bg-background/70 p-3 space-y-2">
                          <header className="flex items-baseline justify-between gap-2">
                            <h6 className="text-sm font-semibold">{entry.word}</h6>
                            {entry.pronounce ? <span className="text-xs text-foreground/60">{entry.pronounce}</span> : null}
                          </header>
                          {entry.heading ? <div className="text-xs uppercase tracking-wide text-foreground/60">{entry.heading}</div> : null}
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none leading-6"
                            dangerouslySetInnerHTML={{ __html: formatDictionaryMarkup(entry.entryText) }}
                          />
                        </article>
                      ))}
                    </section>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
