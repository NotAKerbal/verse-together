"use client";

import { supabase } from "@/lib/supabaseClient";

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

export async function loadPreferences(userId: string | null | undefined): Promise<ReaderPreferences> {
  // Prefer Supabase for signed-in users; fall back to localStorage, then defaults
  if (userId) {
    try {
      const { data, error } = await supabase
        .from("reader_preferences")
        .select("show_footnotes, font_scale, font_family")
        .eq("user_id", userId)
        .maybeSingle();
      if (!error && data) {
        const prefs = normalizePreferences({
          showFootnotes: !!data.show_footnotes,
          fontScale: typeof data.font_scale === "number" ? data.font_scale : 1,
          fontFamily: data.font_family === "sans" ? "sans" : "serif",
        });
        // Keep local in sync
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

export async function savePreferences(userId: string | null | undefined, prefs: ReaderPreferences): Promise<void> {
  // Always write local for quick load
  writeLocalPreferences(prefs);
  if (!userId) return;
  try {
    await supabase
      .from("reader_preferences")
      .upsert(
        {
          user_id: userId,
          show_footnotes: prefs.showFootnotes,
          font_scale: prefs.fontScale,
          font_family: prefs.fontFamily,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
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


