"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  getDefaultPreferences,
  loadPreferences,
  readLocalPreferences,
  savePreferences,
  subscribeLocalPreferences,
  type ReaderPreferences,
} from "@/lib/preferences";

function samePreferences(a: ReaderPreferences, b: ReaderPreferences): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The reader's preferences, shared by the chapter reader and the Settings page: the account's copy when
 * signed in, this device's otherwise. A change saves the same way from either place, and a change made in
 * another tab (or by another part of this one) shows here as it happens.
 */
export function useReaderPreferences(): {
  prefs: ReaderPreferences;
  /** True once the saved preferences have been read (the defaults show until then). */
  loaded: boolean;
  update: (next: ReaderPreferences) => void;
  /** Where a change is saved. */
  syncsToAccount: boolean;
} {
  const { user, getToken } = useAuth();
  const userId = user?.id ?? null;
  const [prefs, setPrefs] = useState<ReaderPreferences>(getDefaultPreferences);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const token = userId ? await getToken({ template: "convex" }) : null;
      const next = await loadPreferences(userId, token);
      if (!alive) return;
      setPrefs((current) => (samePreferences(current, next) ? current : next));
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId, getToken]);

  useEffect(
    () =>
      subscribeLocalPreferences(() => {
        const local = readLocalPreferences();
        if (local) setPrefs((current) => (samePreferences(current, local) ? current : local));
      }),
    []
  );

  const update = useCallback(
    (next: ReaderPreferences) => {
      setPrefs(next);
      // Enqueue before token retrieval resolves so rapid changes keep their interaction order.
      const token = userId ? getToken({ template: "convex" }).catch(() => null) : null;
      void savePreferences(userId, next, token);
    },
    [userId, getToken]
  );

  return { prefs, loaded, update, syncsToAccount: Boolean(userId) };
}
