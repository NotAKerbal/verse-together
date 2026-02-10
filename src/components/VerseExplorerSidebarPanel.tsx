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

export default function VerseExplorerSidebarPanel({ open, onClose, verses }: Props) {
  const [activeWord, setActiveWord] = useState<string>("");
  const [tab, setTab] = useState<"1828" | "ety" | "tg" | "bd">("1828");
  const [tgAvailable, setTgAvailable] = useState<boolean>(false);
  const [bdAvailable, setBdAvailable] = useState<boolean>(false);
  const [etyAvailable, setEtyAvailable] = useState<boolean>(true);
  const [w1828Available, setW1828Available] = useState<boolean>(true);
  const [tgSlug, setTgSlug] = useState<string>("");
  const [bdSlug, setBdSlug] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const joined = verses.map((v) => v.text).join(" ");
    const m = joined.match(/[A-Za-z][A-Za-z'\-]*/);
    setActiveWord(m?.[0]?.toLowerCase() ?? "");
    setTab("1828");
  }, [open, verses]);

  const websterUrl = useMemo(
    () => (w1828Available && activeWord ? `https://webstersdictionary1828.com/Dictionary/${encodeURIComponent(activeWord)}` : ""),
    [activeWord, w1828Available]
  );
  const etyUrl = useMemo(
    () => (etyAvailable && activeWord ? `https://www.etymonline.com/word/${encodeURIComponent(activeWord)}` : ""),
    [activeWord, etyAvailable]
  );
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
        const [tgRes, bdRes, etyRes, w1828Res] = await Promise.all([
          fetch(`/api/tools/exists?type=tg&term=${encodeURIComponent(activeWord)}`, { cache: "no-store" }),
          fetch(`/api/tools/exists?type=bd&term=${encodeURIComponent(activeWord)}`, { cache: "no-store" }),
          fetch(`/api/tools/exists?type=ety&term=${encodeURIComponent(activeWord)}`, { cache: "no-store" }),
          fetch(`/api/tools/exists?type=1828&term=${encodeURIComponent(activeWord)}`, { cache: "no-store" }),
        ]);
        const [tgJson, bdJson, etyJson, w1828Json] = await Promise.all([tgRes.json(), bdRes.json(), etyRes.json(), w1828Res.json()]);
        if (!cancelled) {
          const tgOk = !!tgJson.available;
          const bdOk = !!bdJson.available;
          const etyOk = !!etyJson.available;
          const w1828Ok = !!w1828Json.available;
          setTgAvailable(tgOk);
          setBdAvailable(bdOk);
          setEtyAvailable(etyOk);
          setW1828Available(w1828Ok);
          setTgSlug(tgOk ? tgJson.slug || "" : "");
          setBdSlug(bdOk ? bdJson.slug || "" : "");
        }
      } catch {
        if (!cancelled) {
          setTgAvailable(false);
          setBdAvailable(false);
          setEtyAvailable(false);
          setW1828Available(false);
          setTgSlug("");
          setBdSlug("");
        }
      }
    }
    if (open) void checkAvailability();
    return () => {
      cancelled = true;
    };
  }, [open, activeWord]);

  const currentUrl = tab === "1828" ? websterUrl : tab === "ety" ? etyUrl : tab === "tg" ? tgUrl : bdUrl;

  useEffect(() => {
    if (tab === "tg" && !tgAvailable) setTab("1828");
  }, [tgAvailable, tab]);
  useEffect(() => {
    if (tab === "bd" && !bdAvailable) setTab("1828");
  }, [bdAvailable, tab]);
  useEffect(() => {
    if (tab === "ety" && !etyAvailable) setTab("1828");
  }, [etyAvailable, tab]);
  useEffect(() => {
    if (tab === "1828" && !w1828Available) {
      if (etyAvailable) setTab("ety");
      else if (tgAvailable) setTab("tg");
      else if (bdAvailable) setTab("bd");
    }
  }, [w1828Available, etyAvailable, tgAvailable, bdAvailable, tab]);

  if (!open) return null;

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15 bg-background/60 backdrop-blur p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Verse Explorer</h3>
        <button onClick={onClose} className="px-2.5 py-1 text-sm rounded-md border border-black/10 dark:border-white/15">
          Close
        </button>
      </div>
      <div className="text-sm text-foreground/70">Select a word to explore definitions and related entries.</div>

      <div className="space-y-2 p-2.5 rounded-md border border-black/10 dark:border-white/15 bg-black/5 dark:bg-white/5 max-h-[24vh] overflow-y-auto">
        {verses.map((v) => {
          const parts = tokenize(v.text);
          return (
            <div key={v.verse} className="leading-6 text-sm">
              <span className="mr-2 text-foreground/60 text-sm align-top select-none">{v.verse}</span>
              {parts.map((p, idx) =>
                p.type === "word" ? (
                  <button
                    key={`${v.verse}-${idx}`}
                    onClick={() => {
                      setActiveWord(p.value.toLowerCase());
                      setTab("1828");
                    }}
                    className={`px-0.5 rounded ${
                      activeWord && activeWord.toLowerCase() === p.value.toLowerCase()
                        ? "bg-amber-300/50 dark:bg-amber-400/25 ring-1 ring-amber-600/30"
                        : "hover:bg-black/10 dark:hover:bg-white/10"
                    }`}
                    title={`Look up ${p.value}`}
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
          {w1828Available ? (
            <button
              onClick={() => setTab("1828")}
              className={`px-2.5 py-1 text-sm ${tab === "1828" ? "bg-background/70" : "bg-transparent hover:bg-black/5 dark:hover:bg-white/10"}`}
            >
              1828
            </button>
          ) : null}
          {etyAvailable ? (
            <button
              onClick={() => setTab("ety")}
              className={`px-2.5 py-1 text-sm ${tab === "ety" ? "bg-background/70" : "bg-transparent hover:bg-black/5 dark:hover:bg-white/10"}`}
            >
              Ety
            </button>
          ) : null}
          {tgAvailable ? (
            <button
              onClick={() => setTab("tg")}
              className={`px-2.5 py-1 text-sm ${tab === "tg" ? "bg-background/70" : "bg-transparent hover:bg-black/5 dark:hover:bg-white/10"}`}
              title="Topical Guide"
            >
              TG
            </button>
          ) : null}
          {bdAvailable ? (
            <button
              onClick={() => setTab("bd")}
              className={`px-2.5 py-1 text-sm ${tab === "bd" ? "bg-background/70" : "bg-transparent hover:bg-black/5 dark:hover:bg-white/10"}`}
              title="Bible Dictionary"
            >
              BD
            </button>
          ) : null}
        </div>
        {activeWord && currentUrl ? (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 text-xs rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
          >
            Open
          </a>
        ) : null}
      </div>

      <div className="rounded-md overflow-hidden border border-black/10 dark:border-white/15 bg-black/5 dark:bg-white/5 h-[44vh]">
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
          <div className="w-full h-full grid place-items-center text-sm text-foreground/60 p-3 text-center">
            {activeWord ? "No entry found for this tool." : "Select a word to preview"}
          </div>
        )}
      </div>
    </div>
  );
}
