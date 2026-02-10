"use client";

import { useEffect, useMemo, useState } from "react";
import DictionaryEntryCard from "@/components/DictionaryEntryCard";

type Verse = { verse: number; text: string };

type Props = {
  open: boolean;
  onClose: () => void;
  verses: Verse[];
};

type ExplorerTab = "dict" | "tg" | "bd";
type DictionaryEntry = {
  id: string;
  edition: "1828" | "1844" | "1913";
  word: string;
  heading: string | null;
  entryText: string;
  pronounce: string | null;
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
  const [tab, setTab] = useState<ExplorerTab>("dict");
  const [dictEnabled, setDictEnabled] = useState<boolean>(false);
  const [entries1828, setEntries1828] = useState<DictionaryEntry[]>([]);
  const [entries1844, setEntries1844] = useState<DictionaryEntry[]>([]);
  const [entries1913, setEntries1913] = useState<DictionaryEntry[]>([]);
  const [tgAvailable, setTgAvailable] = useState<boolean>(false);
  const [bdAvailable, setBdAvailable] = useState<boolean>(false);
  const [w1828Available, setW1828Available] = useState<boolean>(true);
  const [tgSlug, setTgSlug] = useState<string>("");
  const [bdSlug, setBdSlug] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const joined = verses.map((v) => v.text).join(" ");
    const m = joined.match(/[A-Za-z][A-Za-z'\-]*/);
    setActiveWord(m?.[0]?.toLowerCase() ?? "");
    setTab("dict");
  }, [open, verses]);

  const websterUrl = useMemo(
    () => (w1828Available && activeWord ? `https://webstersdictionary1828.com/Dictionary/${encodeURIComponent(activeWord)}` : ""),
    [activeWord, w1828Available]
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
        const [tgRes, bdRes, w1828Res, dictRes] = await Promise.all([
          fetch(`/api/tools/exists?type=tg&term=${encodeURIComponent(activeWord)}`, { cache: "no-store" }),
          fetch(`/api/tools/exists?type=bd&term=${encodeURIComponent(activeWord)}`, { cache: "no-store" }),
          fetch(`/api/tools/exists?type=1828&term=${encodeURIComponent(activeWord)}`, { cache: "no-store" }),
          fetch(`/api/tools/dictionary?term=${encodeURIComponent(activeWord)}`, { cache: "no-store" }),
        ]);
        const [tgJson, bdJson, w1828Json, dictJson] = await Promise.all([
          tgRes.json(),
          bdRes.json(),
          w1828Res.json(),
          dictRes.json(),
        ]);
        if (!cancelled) {
          const tgOk = !!tgJson.available;
          const bdOk = !!bdJson.available;
          const inAppEnabled = !!dictJson.enabled;
          const e1828 = (dictJson.byEdition?.["1828"]?.entries ?? []) as DictionaryEntry[];
          const e1844 = (dictJson.byEdition?.["1844"]?.entries ?? []) as DictionaryEntry[];
          const e1913 = (dictJson.byEdition?.["1913"]?.entries ?? []) as DictionaryEntry[];
          const hasAnyInApp = e1828.length > 0 || e1844.length > 0 || e1913.length > 0;
          const w1828Ok = inAppEnabled ? hasAnyInApp : !!w1828Json.available;
          setDictEnabled(inAppEnabled);
          setEntries1828(inAppEnabled ? e1828 : []);
          setEntries1844(inAppEnabled ? e1844 : []);
          setEntries1913(inAppEnabled ? e1913 : []);
          setTgAvailable(tgOk);
          setBdAvailable(bdOk);
          setW1828Available(w1828Ok);
          setTgSlug(tgOk ? tgJson.slug || "" : "");
          setBdSlug(bdOk ? bdJson.slug || "" : "");
        }
      } catch {
        if (!cancelled) {
          setDictEnabled(false);
          setEntries1828([]);
          setEntries1844([]);
          setEntries1913([]);
          setTgAvailable(false);
          setBdAvailable(false);
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

  const currentUrl = tab === "tg" ? tgUrl : tab === "bd" ? bdUrl : !dictEnabled ? websterUrl : "";
  const inAppDictionaryTab = dictEnabled && tab === "dict";

  useEffect(() => {
    if (tab === "tg" && !tgAvailable) setTab("dict");
  }, [tgAvailable, tab]);
  useEffect(() => {
    if (tab === "bd" && !bdAvailable) setTab("dict");
  }, [bdAvailable, tab]);
  useEffect(() => {
    if (tab === "dict" && !w1828Available) {
      if (tgAvailable) setTab("tg");
      else if (bdAvailable) setTab("bd");
    }
  }, [w1828Available, tgAvailable, bdAvailable, tab]);

  if (!open) return null;

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15 bg-background/60 backdrop-blur p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Verse Explorer</h3>
        <button onClick={onClose} className="px-2.5 py-1 text-sm rounded-md border border-black/10 dark:border-white/15">
          Close
        </button>
      </div>
      <div className="text-sm text-foreground/70">Select a word to explore dictionary entries and related tools.</div>

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
                      setTab("dict");
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
              onClick={() => setTab("dict")}
              className={`px-2.5 py-1 text-sm ${tab === "dict" ? "bg-background/70" : "bg-transparent hover:bg-black/5 dark:hover:bg-white/10"}`}
            >
              Dictionary
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
        {activeWord && inAppDictionaryTab && (entries1828.length > 0 || entries1844.length > 0 || entries1913.length > 0) ? (
          <div className="w-full h-full overflow-y-auto p-3 space-y-3">
            {[
              { edition: "1828", rows: entries1828 },
              { edition: "1844", rows: entries1844 },
              { edition: "1913", rows: entries1913 },
            ]
              .filter((group) => group.rows.length > 0)
              .map((group) => (
                <section key={group.edition} className="space-y-2">
                  <h4 className="text-xs font-semibold tracking-wide text-foreground/60">{group.edition} Webster</h4>
                  {group.rows.map((entry) => (
                    <DictionaryEntryCard key={entry.id} entry={entry} edition={group.edition as "1828" | "1844" | "1913"} />
                  ))}
                </section>
              ))}
          </div>
        ) : activeWord && currentUrl ? (
          <iframe
            title={
              tab === "dict"
                ? `Dictionary: ${activeWord}`
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
