"use client";

import { useSyncExternalStore } from "react";
import { readLocalMarkPresetsSnapshot, subscribeLocalPreferences, type MarkPreset } from "@/lib/preferences";

/**
 * This device's mark presets, live: a change saved in settings (in this tab or another) shows at once. Null
 * until browser storage can be read (on the server, and while hydrating).
 */
export function useDeviceMarkPresets(): readonly MarkPreset[] | null {
  return useSyncExternalStore(subscribeLocalPreferences, readLocalMarkPresetsSnapshot, () => null);
}
