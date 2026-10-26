"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { readMarkPresets } from "../../../convex/annotationRules";
import { useAuth } from "@/lib/auth";
import { writeLocalMarkPresets } from "@/lib/preferences";
import type { VerseQuickMarks } from "@/components/VerseActionBar";
import { deviceStudy } from "../notes/deviceStudy";
import { useConvexSignedIn } from "../notes/useConvexSignedIn";
import {
  quickMarkPatch,
  withVerseMarks,
  type AnnotationChapter,
  type ChapterAnnotations,
  type MarkPreset,
  type SelectionMarks,
  type VerseMarksPatch,
  type VerseTextRange,
} from "./verseAnnotations";

/**
 * The reader's mark presets for a selection menu, live: the account's (a change in account settings shows at
 * once, and is kept as this device's copy), `fallbackPresets` (this device's copy) until they load, and the
 * defaults for guests and an account with nothing saved yet. `ready` is false while a signed-in reader's
 * session is still connecting (nothing can be saved to the account yet).
 */
export function useMarkPresets(fallbackPresets: readonly MarkPreset[]): {
  presets: readonly MarkPreset[];
  ready: boolean;
  convexReady: boolean;
} {
  const { user } = useAuth();
  const { ready: convexReady } = useConvexSignedIn();
  const accountPreferences = useQuery(api.preferences.getReaderPreferences, convexReady ? {} : "skip");
  const accountMarkPresets = accountPreferences?.markPresets;
  useEffect(() => {
    if (accountMarkPresets) writeLocalMarkPresets(accountMarkPresets);
  }, [accountMarkPresets]);
  return {
    // Presets are an account setting: guests (and an account with nothing saved yet) get the defaults.
    presets: !user || accountPreferences === null ? readMarkPresets(null) : accountMarkPresets ?? fallbackPresets,
    ready: !user || convexReady,
    convexReady,
  };
}

/** One chapter's part of a selection: setVerseMarks (and this device's copy of it) writes a chapter at a time. */
export type QuickMarkWrite = { target: AnnotationChapter; verses: readonly number[]; ranges?: VerseTextRange[] };

type Options = {
  /** The selection the menu is on; a failed mark's message belongs to the selection it was made on. */
  selectionKey: string;
  /** What the selected verses share (selectionMarks), so a preset knows whether to put itself on or take itself off. */
  marks: SelectionMarks;
  /** The selected verses, per chapter (annotationChapter identities: the same rows the chapter query reads). */
  writes: readonly QuickMarkWrite[];
  /** False until every selected chapter's annotations have loaded. */
  loaded: boolean;
  /** The presets until the account's load (this device's copy of them). */
  fallbackPresets: readonly MarkPreset[];
  /** Keep the exact selection across text-node changes made by the optimistic render. */
  beforeSave?: () => void;
  onSaveError?: () => void;
};

/**
 * The selection menu's quick marks (VerseActionBar), for any reader: the account's mark presets, live (this
 * device's copy until they load, the defaults for guests), and marking the selected verses. Signed in, marks save
 * to the account (setVerseMarks, shown at once by an optimistic update); guests mark on this device, and signing
 * in imports the marks. Only the named marks change, never a note.
 */
export function useVerseQuickMarks({ selectionKey, marks, writes, loaded, fallbackPresets, beforeSave, onSaveError }: Options): {
  quickMarks: VerseQuickMarks;
  /** A mark is saving: the optimistic row may not have a server id yet, so the full editor waits. */
  pending: boolean;
} {
  const { user, promptSignIn } = useAuth();
  const { presets, ready: presetsReady, convexReady } = useMarkPresets(fallbackPresets);
  const saveVerseMarks = useMutation(api.annotations.setVerseMarks).withOptimisticUpdate((store, args) => {
    const query = { volume: args.volume, book: args.book, chapter: args.chapter };
    const current = store.getQuery(api.annotations.getChapterAnnotations, query) as ChapterAnnotations | undefined;
    if (!current) return;
    store.setQuery(
      api.annotations.getChapterAnnotations,
      query,
      withVerseMarks(current, args.verses, {
        highlightColor: args.highlightColor,
        underline: args.underline,
        underlineColor: args.underlineColor,
        ranges: args.ranges,
      }) as never
    );
  });
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<{ selectionKey: string; message: string } | null>(null);
  // A new selection drops the last one's message (adjusted during render, as React derives state from an input).
  const [errorScope, setErrorScope] = useState(selectionKey);
  if (errorScope !== selectionKey) {
    setErrorScope(selectionKey);
    if (error) setError(null);
  }

  async function save(chapters: readonly QuickMarkWrite[], patch: VerseMarksPatch, key: string) {
    setError(null);
    if (!user) {
      // Guests mark on this device (written at once).
      try {
        for (const { target, verses, ranges } of chapters) deviceStudy.setVerseMarks(target, verses, ranges ? { ...patch, ranges } : patch);
      } catch {
        onSaveError?.();
        setError({ selectionKey: key, message: "Couldn't save that mark on this device. Allow browser storage and try again." });
      }
      return;
    }
    if (!convexReady) return;
    setPending((count) => count + 1);
    try {
      const results = await Promise.allSettled(
        chapters.map(({ target, verses, ranges }) => saveVerseMarks({ ...target, verses: [...verses], ...patch, ...(ranges ? { ranges } : {}) }))
      );
      if (results.some((result) => result.status === "rejected")) {
        onSaveError?.();
        setError({ selectionKey: key, message: "Couldn't save that mark. Try again." });
      }
    } finally {
      setPending((count) => count - 1);
    }
  }

  const chapters = writes.filter((write) => write.verses.length > 0);
  const quickMarks: VerseQuickMarks = {
    presets,
    marks,
    status: !presetsReady || !loaded ? "loading" : "ready",
    pending: pending > 0,
    error: error?.selectionKey === selectionKey ? error.message : null,
    onMark: (preset) => {
      if (!loaded || !presetsReady || chapters.length === 0) return;
      beforeSave?.();
      // One patch from the whole selection, so every selected verse ends the same, whichever chapter it is in.
      void save(chapters, quickMarkPatch(preset, marks), selectionKey);
    },
    onSignIn: () => {
      void promptSignIn();
    },
  };
  return { quickMarks, pending: pending > 0 };
}
