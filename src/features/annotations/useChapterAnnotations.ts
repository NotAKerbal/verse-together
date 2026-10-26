"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/lib/auth";
import { useDeviceStudy } from "../notes/useDeviceStudy";
import { annotationChapter, deviceChapterAnnotations, type ChapterAnnotations } from "./verseAnnotations";

export { deviceChapterAnnotations };

/**
 * One chapter's annotations, for any reader: the account's (a live subscription) when signed in, else this
 * device's. Either way under annotationChapter's identity, so the Come, Follow Me pane and the standard reader
 * read the same rows.
 */
export function useChapterAnnotations(volume: string, book: string, chapter: number): ChapterAnnotations | undefined {
  const { user } = useAuth();
  const device = useDeviceStudy();
  const target = annotationChapter(volume, book, chapter);
  const remote = useQuery(api.annotations.getChapterAnnotations, user ? target : "skip");
  if (user) return remote;
  if (!device.loaded) return undefined;
  return deviceChapterAnnotations(device.data.annotations, target);
}
