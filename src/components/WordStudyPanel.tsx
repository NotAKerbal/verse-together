"use client";

import { useEffect, useMemo, useState } from "react";
import DictionaryEntryCard from "@/components/DictionaryEntryCard";
import EtymologyEntryCard from "@/components/EtymologyEntryCard";

type Props = {
  word: string;
  panelId?: string;
  title?: string;
};

type StudyTab = "dict" | "ety";
type DictionaryEdition = "1828" | "1844" | "1913";
type DictionaryEntry = {
  id: string;
  edition: DictionaryEdition;
  word: string;
  heading: string | null;
  entryText: string;
  pronounce: string | null;
};
type DictionaryGroup = { edition: DictionaryEdition; rows: DictionaryEntry[] };
type EtymologyItem = { id: string; source: string; word: string; text: string };

const DEFAULT_PROVIDER_LABELS: Record<DictionaryEdition, string> = {
  "1828": "Merriam-Webster",
  "1844": "Unavailable",
  "1913": "Free Dictionary API",
};

export default function WordStudyPanel({ word, panelId, title = "Word Study" }: Props) {
  const normalizedWord = word.trim().toLowerCase();
  const [tab, setTab] = useState<StudyTab>("dict");
  const [dictEnabled, setDictEnabled] = useState(false);
  const [entries1828, setEntries1828] = useState<DictionaryEntry[]>([]);
  const [entries1844, setEntries1844] = useState<DictionaryEntry[]>([]);
  const [entries1913, setEntries1913] = useState<DictionaryEntry[]>([]);
  const [providerLabels, setProviderLabels] = useState<Record<DictionaryEdition, string>>(DEFAULT_PROVIDER_LABELS);
  const [etymologyItems, setEtymologyItems] = useState<EtymologyItem[]>([]);

  useEffect(() => {
    setTab("dict");
  }, [normalizedWord]);

  useEffect(() => {
    let cancelled = false;

    async function loadEntries() {
      if (!normalizedWord) {
        setDictEnabled(false);
        setEntries1828([]);
        setEntries1844([]);
        setEntries1913([]);
        setEtymologyItems([]);
        return;
      }

      try {
        const response = await fetch(`/api/tools/dictionary?term=${encodeURIComponent(normalizedWord)}`, { cache: "no-store" });
        const payload = await response.json();

        if (cancelled) return;

        const inAppEnabled = !!payload.enabled;
        const next1828 = (payload.byEdition?.["1828"]?.entries ?? []) as DictionaryEntry[];
        const next1844 = (payload.byEdition?.["1844"]?.entries ?? []) as DictionaryEntry[];
        const next1913 = (payload.byEdition?.["1913"]?.entries ?? []) as DictionaryEntry[];

        setDictEnabled(inAppEnabled);
        setEntries1828(inAppEnabled ? next1828 : []);
        setEntries1844(inAppEnabled ? next1844 : []);
        setEntries1913(inAppEnabled ? next1913 : []);
        setEtymologyItems((payload.etymology?.items ?? []) as EtymologyItem[]);
        setProviderLabels((payload.providerLabels ?? DEFAULT_PROVIDER_LABELS) as Record<DictionaryEdition, string>);
      } catch {
        if (cancelled) return;
        setDictEnabled(false);
        setEntries1828([]);
        setEntries1844([]);
        setEntries1913([]);
        setEtymologyItems([]);
      }
    }

    void loadEntries();

    return () => {
      cancelled = true;
    };
  }, [normalizedWord]);

  const hasDictionaryEntries = dictEnabled && (entries1828.length > 0 || entries1844.length > 0 || entries1913.length > 0);
  const hasEtymologyEntries = etymologyItems.length > 0;
  const availableTabs = useMemo(() => {
    const next: StudyTab[] = [];
    if (hasDictionaryEntries) next.push("dict");
    if (hasEtymologyEntries) next.push("ety");
    return next;
  }, [hasDictionaryEntries, hasEtymologyEntries]);

  useEffect(() => {
    if (availableTabs.length === 0) return;
    if (!availableTabs.includes(tab)) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, tab]);

  if (!normalizedWord) return null;

  return (
    <div id={panelId} data-word-study-panel="true" className="rounded-lg border border-black/10 bg-background/60 p-3 backdrop-blur dark:border-white/15">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <div className="text-sm text-foreground/65">{normalizedWord}</div>
        </div>
        <div className="flex items-center gap-2">
          {availableTabs.length > 1 ? (
            <div className="segmented-control" role="tablist" aria-label="Word study sources">
              <button
                type="button"
                onClick={() => setTab("dict")}
                className="segmented-control-button px-2.5 text-sm"
                data-active={tab === "dict"}
                disabled={!hasDictionaryEntries}
              >
                Dictionary
              </button>
              <button
                type="button"
                onClick={() => setTab("ety")}
                className="segmented-control-button px-2.5 text-sm"
                data-active={tab === "ety"}
                disabled={!hasEtymologyEntries}
              >
                Etymology
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-black/10 bg-black/5 dark:border-white/15 dark:bg-white/5">
        {tab === "ety" && hasEtymologyEntries ? (
          <div className="max-h-[40vh] overflow-y-auto p-3 space-y-3">
            {etymologyItems.map((item) => (
              <EtymologyEntryCard key={item.id} item={item} />
            ))}
          </div>
        ) : hasDictionaryEntries ? (
          <div className="max-h-[40vh] overflow-y-auto p-3 space-y-3">
            {([
              { edition: "1828", rows: entries1828 },
              { edition: "1844", rows: entries1844 },
              { edition: "1913", rows: entries1913 },
            ] as DictionaryGroup[])
              .filter((group) => group.rows.length > 0)
              .map((group) => (
                <section key={group.edition} className="space-y-2">
                  <h4 className="text-xs font-semibold tracking-wide text-foreground/60">
                    {providerLabels[group.edition] || "Dictionary Source"}
                  </h4>
                  {group.rows.map((entry) => (
                    <DictionaryEntryCard key={entry.id} entry={entry} edition={group.edition} />
                  ))}
                </section>
              ))}
          </div>
        ) : hasEtymologyEntries ? (
          <div className="max-h-[40vh] overflow-y-auto p-3 space-y-3">
            {etymologyItems.map((item) => (
              <EtymologyEntryCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="p-3 text-sm text-foreground/60">
            No dictionary or etymology entries found for this word.
          </div>
        )}
      </div>
    </div>
  );
}
