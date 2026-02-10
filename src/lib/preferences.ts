"use client";

import { getReaderPreferences, saveReaderPreferences as saveReaderPreferencesRemote } from "@/lib/appData";

export type ReaderPreferences = {
  showFootnotes: boolean;
  fontScale: number; // 0.85 - 1.3
  fontFamily: "serif" | "sans";
};

const STORAGE_KEY = "reader_prefs_v1";
const ONBOARDING_KEY = "reader_onboarding_v1";

export function getDefaultPreferences(): ReaderPreferences {
  return {
    showFootnotes: false,
    fontScale: 1,
    fontFamily: "serif",
  };
}

export function readLocalPreferences(): ReaderPreferences | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReaderPreferences>;
    return normalizePreferences(parsed);
  } catch {
    return null;
  }
}

export function writeLocalPreferences(prefs: ReaderPreferences): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function normalizePreferences(input: Partial<ReaderPreferences> | null | undefined): ReaderPreferences {
  const base = getDefaultPreferences();
  const showFootnotes = typeof input?.showFootnotes === "boolean" ? input!.showFootnotes : base.showFootnotes;
  const fontScaleRaw = typeof input?.fontScale === "number" ? input!.fontScale : base.fontScale;
  const fontScale = Math.min(1.3, Math.max(0.85, Number.isFinite(fontScaleRaw) ? fontScaleRaw : 1));
  const fontFamily = input?.fontFamily === "sans" || input?.fontFamily === "serif" ? input.fontFamily : base.fontFamily;
  return { showFootnotes, fontScale, fontFamily };
}

export async function loadPreferences(
  userId: string | null | undefined,
  token?: string | null
): Promise<ReaderPreferences> {
  // Prefer Convex for signed-in users; fall back to localStorage, then defaults
  if (userId && token) {
    try {
      const data = await getReaderPreferences(token);
      if (data) {
        const prefs = normalizePreferences({
          showFootnotes: !!data.showFootnotes,
          fontScale: typeof data.fontScale === "number" ? data.fontScale : 1,
          fontFamily: data.fontFamily === "sans" ? "sans" : "serif",
        });
        writeLocalPreferences(prefs);
        return prefs;
      }
    } catch {
      // ignore and fall back
    }
  }
  const local = readLocalPreferences();
  if (local) return local;
  return getDefaultPreferences();
}

export async function savePreferences(
  userId: string | null | undefined,
  prefs: ReaderPreferences,
  token?: string | null
): Promise<void> {
  writeLocalPreferences(prefs);
  if (!userId || !token) return;
  try {
    await saveReaderPreferencesRemote(token, {
      showFootnotes: prefs.showFootnotes,
      fontScale: prefs.fontScale,
      fontFamily: prefs.fontFamily,
    });
  } catch {
    // ignore
  }
}

// One-time onboarding flags (local-only)
type OnboardingFlags = {
  seenTapHint: boolean;
};

function readOnboardingFlags(): OnboardingFlags {
  try {
    if (typeof window === "undefined") return { seenTapHint: false };
    const raw = window.localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return { seenTapHint: false };
    const parsed = JSON.parse(raw) as Partial<OnboardingFlags>;
    return { seenTapHint: !!parsed.seenTapHint };
  } catch {
    return { seenTapHint: false };
  }
}

function writeOnboardingFlags(flags: OnboardingFlags): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify(flags));
  } catch {
    // ignore
  }
}

export function hasSeenTapToActionsHint(): boolean {
  return readOnboardingFlags().seenTapHint;
}

export function setSeenTapToActionsHint(): void {
  const next: OnboardingFlags = { seenTapHint: true };
  writeOnboardingFlags(next);
}


