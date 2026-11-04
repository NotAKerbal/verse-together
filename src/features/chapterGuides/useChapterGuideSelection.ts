"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChapterGuideSelectionState } from "@/lib/chapterGuideView";
import { type ChapterGuideSession, createChapterGuideSession } from "./chapterGuideSession";

type Snapshot = {
  key: string;
  state: ChapterGuideSelectionState | null;
  loadFailed: boolean;
  requesting: boolean;
  requestError: string | null;
};

export type ChapterGuideSelection = Omit<Snapshot, "key"> & { request: () => Promise<void> };

const EMPTY: Omit<Snapshot, "key"> = { state: null, loadFailed: false, requesting: false, requestError: null };

export function useChapterGuideSelection(chapter: { volume: string; book: string; chapter: number }, verseSpec: string): ChapterGuideSelection {
  const { volume, book, chapter: number } = chapter;
  const key = `${volume}/${book}/${number}/${verseSpec}`;
  const [snapshot, setSnapshot] = useState<Snapshot>({ key, ...EMPTY });
  const session = useRef<ChapterGuideSession | null>(null);

  useEffect(() => {
    const update = (patch: Partial<Snapshot>) =>
      setSnapshot((previous) => ({ ...(previous.key === key ? previous : { key, ...EMPTY }), ...patch }));
    const current = createChapterGuideSession({ volume, book, chapter: number }, verseSpec, {
      onState: (state) => update({ state, loadFailed: false }),
      onLoadFailed: () => update({ loadFailed: true }),
    });
    session.current = current;
    void current.load();
    return () => current.dispose();
  }, [key, volume, book, number, verseSpec]);

  const request = useCallback(async () => {
    const current = session.current;
    if (!current) return;
    const update = (patch: Partial<Snapshot>) =>
      setSnapshot((previous) => ({ ...(previous.key === key ? previous : { key, ...EMPTY }), ...patch }));
    update({ requesting: true, requestError: null });
    const outcome = await current.request();
    if (!outcome) return;
    update({ requesting: false, requestError: outcome.error });
  }, [key]);

  const view = snapshot.key === key ? snapshot : { key, ...EMPTY };
  return { state: view.state, loadFailed: view.loadFailed, requesting: view.requesting, requestError: view.requestError, request };
}
