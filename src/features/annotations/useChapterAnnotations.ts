"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/lib/auth";
import { useDeviceStudy } from "../notes/useDeviceStudy";
import { annotationChapter, type ChapterAnnotations } from "./verseAnnotations";

export function useChapterAnnotations(volume: string, book: string, chapter: number): ChapterAnnotations | undefined {
  const { user } = useAuth();
  const device = useDeviceStudy();
  const target = annotationChapter(volume, book, chapter);
  const remote = useQuery(api.annotations.getChapterAnnotations, user ? target : "skip");
  if (user) return remote;
  if (!device.loaded) return undefined;
  return deviceChapterAnnotations(device.data.annotations, target);
}

export function deviceChapterAnnotations(
  rows: ReturnType<typeof useDeviceStudy>["data"]["annotations"],
  target: { volume: string; book: string; chapter: number },
): ChapterAnnotations {
  const by_verse: ChapterAnnotations["by_verse"] = {};
  for (const row of rows) {
    if (
      row.owner !== null ||
      row.volume !== target.volume ||
      row.book !== target.book ||
      row.chapter !== target.chapter
    )
      continue;
    (by_verse[row.verse] ??= []).push(row);
  }
  return { by_verse };
}
