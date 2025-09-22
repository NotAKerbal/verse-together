"use client";

import { useEffect, useMemo, useState } from "react";

type Verse = { verse: number; text: string };

type Props = {
  open: boolean;
  onClose: () => void;
  verses: Verse[];
};

function tokenize(text: string): Array<{ type: "word" | "sep"; value: string }> {
  const tokens: Array<{ type: "word" | "sep"; value: string }> = [];
  const re = /[A-Za-z][A-Za-z'\-]*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) != null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      tokens.push({ type: "sep", value: text.slice(lastIndex, start) });
    }
    tokens.push({ type: "word", value: match[0] });
    lastIndex = end;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: "sep", value: text.slice(lastIndex) });
  }
  return tokens;
}

export default function VerseExplorer({ open, onClose, verses }: Props) {
  const [activeWord, setActiveWord] = useState<string>("");
  const [tab, setTab] = useState<"1828" | "ety" | "tg" | "bd">("1828");
  const [tgAvailable, setTgAvailable] = useState<boolean>(false);
  const [bdAvailable, setBdAvailable] = useState<boolean>(false);
  const [tgSlug, setTgSlug] = useState<string>("");
  const [bdSlug, setBdSlug] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    // pick the first plausible word from provided verses
    const joined = verses.map((v) => v.text).join(" ");
    const m = joined.match(/[A-Za-z][A-Za-z'\-]*/);
    setActiveWord(m?.[0]?.toLowerCase() ?? "");
    setTab("1828");
  }, [open, verses]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  const websterUrl = useMemo(() => (activeWord ? `https://webstersdictionary1828.com/Dictionary/${encodeURIComponent(activeWord)}` : ""), [activeWord]);
  const etyUrl = useMemo(() => (activeWord ? `https://www.etymonline.com/word/${encodeURIComponent(activeWord)}` : ""), [activeWord]);
  const tgUrl = useMemo(
    () => (tgAvailable && tgSlug ? `https://www.churchofjesuschrist.org/study/scriptures/tg/${encodeURIComponent(tgSlug)}?lang=eng` : ""),
    [tgAvailable, tgSlug]
  );
  const bdUrl = useMemo(
    () => (bdAvailable && bdSlug ? `https://www.churchofjesuschrist.org/study/scriptures/bd/${encodeURIComponent(bdSlug)}?lang=eng` : ""),
    [bdAvailable, bdSlug]
  );

  useEffect(() => {
    let cancelled = false;
    async function checkAvailability() {
      if (!activeWord) {
        setTgAvailable(false);
        setBdAvailable(false);
        return;
      }
      try {
        const [tgRes, bdRes] = await Promise.all([
          fetch(`/api/tools/exists?type=tg&term=${encodeURIComponent(activeWord)}`, { cache: "no-store" }),
          fetch(`/api/tools/exists?type=bd&term=${encodeURIComponent(activeWord)}`, { cache: "no-store" }),
        ]);
        const [tgJson, bdJson] = await Promise.all([tgRes.json(), bdRes.json()]);
        if (!cancelled) {
          const tgOk = !!tgJson.available;
          const bdOk = !!bdJson.available;
          setTgAvailable(tgOk);
          setBdAvailable(bdOk);
          setTgSlug(tgOk ? tgJson.slug || "" : "");
          setBdSlug(bdOk ? bdJson.slug || "" : "");
        }
      } catch {
        if (!cancelled) {
          setTgAvailable(false);
          setBdAvailable(false);
          setTgSlug("");
          setBdSlug("");
        }
      }
    }
    checkAvailability();
    return () => {
      cancelled = true;
    };
  }, [activeWord]);

  const currentUrl = tab === "1828" ? websterUrl : tab === "ety" ? etyUrl : tab === "tg" ? tgUrl : bdUrl;

  // Ensure we don't stay on a tab that becomes unavailable
  useEffect(() => {
    if (tab === "tg" && !tgAvailable) setTab("1828");
  }, [tgAvailable, tab]);
  useEffect(() => {
    if (tab === "bd" && !bdAvailable) setTab("1828");
  }, [bdAvailable, tab]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="absolute left-3 right-3 sm:left-4 sm:right-4 bottom-0 rounded-t-2xl bg-background shadow-2xl border-t border-black/10 dark:border-white/15 p-3 sm:p-4 space-y-3 max-h-[80vh] overflow-hidden">
        <div className="h-1 w-10 bg-foreground/20 rounded-full mx-auto mb-1" />
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Verse Explorer</h3>
          <button onClick={onClose} className="px-3 py-1 text-sm rounded-md border border-black/10 dark:border-white/15">Close</button>
        </div>
        <div className="text-sm text-foreground/70">Tap a word below to explore its 1828 definition or etymology.</div>

        <div className="space-y-2 p-2 rounded-md border border-black/10 dark:border-white/15 bg-black/5 dark:bg-white/5 max-h-[26vh] overflow-y-auto">
          {verses.map((v) => {
            const parts = tokenize(v.text);
            return (
              <div key={v.verse} className="leading-7">
                <span className="mr-2 text-foreground/60 text-xs sm:text-sm align-top select-none">{v.verse}</span>
                {parts.map((p, idx) =>
                  p.type === "word" ? (
                    <button
                      key={`${v.verse}-${idx}`}
                      onClick={() => {
                        setActiveWord(p.value.toLowerCase());
                        setTab("1828");
                      }}
                      className={`px-0.5 rounded ${activeWord && activeWord.toLowerCase() === p.value.toLowerCase() ? "bg-amber-300/50 dark:bg-amber-400/25 ring-1 ring-amber-600/30" : "hover:bg-black/10 dark:hover:bg-white/10"}`}
                      title={`Look up “${p.value}”`}
                    >
                      {p.value}
                    </button>
                  ) : (
                    <span key={`${v.verse}-s-${idx}`}>{p.value}</span>
                  )
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-md border border-black/10 dark:border-white/15 overflow-hidden">
            <button
              onClick={() => setTab("1828")}
              className={`px-3 py-1 text-sm ${tab === "1828" ? "bg-background/70" : "bg-transparent hover:bg-black/5 dark:hover:bg-white/10"}`}
            >
              📖 1828
            </button>
            <button
              onClick={() => setTab("ety")}
              className={`px-3 py-1 text-sm ${tab === "ety" ? "bg-background/70" : "bg-transparent hover:bg-black/5 dark:hover:bg-white/10"}`}
            >
              🧬 Etymology
            </button>
            {tgAvailable ? (
              <button
                onClick={() => setTab("tg")}
                className={`px-3 py-1 text-sm ${tab === "tg" ? "bg-background/70" : "bg-transparent hover:bg-black/5 dark:hover:bg-white/10"}`}
                title="Topical Guide"
              >
                🗂️ TG
              </button>
            ) : null}
            {bdAvailable ? (
              <button
                onClick={() => setTab("bd")}
                className={`px-3 py-1 text-sm ${tab === "bd" ? "bg-background/70" : "bg-transparent hover:bg-black/5 dark:hover:bg-white/10"}`}
                title="Bible Dictionary"
              >
                📘 BD
              </button>
            ) : null}
          </div>
          {activeWord && currentUrl ? (
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 text-xs rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
              title="Open in new tab"
            >
              ↗ {activeWord}
            </a>
          ) : null}
        </div>

        <div className="rounded-md overflow-hidden border border-black/10 dark:border-white/15 bg-black/5 dark:bg-white/5" style={{ height: "40vh" }}>
          {activeWord && currentUrl ? (
            <iframe
              title={
                tab === "1828"
                  ? `1828: ${activeWord}`
                  : tab === "ety"
                  ? `Etymology: ${activeWord}`
                  : tab === "tg"
                  ? `Topical Guide: ${activeWord}`
                  : `Bible Dictionary: ${activeWord}`
              }
              src={currentUrl}
              className="w-full h-full bg-background"
              referrerPolicy="no-referrer"
              sandbox="allow-same-origin allow-scripts"
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-sm text-foreground/60">
              {activeWord ? "No entry found for this tool. Try another tool or word." : "Select a word to preview"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


