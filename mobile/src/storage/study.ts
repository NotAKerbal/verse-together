// This device's study: journal entries, verse annotations and guide highlights, kept by the web app's own
// DeviceStudyStore (src/features/notes/deviceStudy.ts) over native storage. The records and rules are the
// web's signed-out study, byte for byte, so a future account import can take them as they are.

import { useCallback, useSyncExternalStore } from "react";
import { DeviceStudyStore, EMPTY_DEVICE_STUDY, type DeviceStudy } from "../shared/web";
import { storage } from "./kv";

export const deviceStudy = new DeviceStudyStore(() => storage());

let loadError: string | null = null;

/** Reads storage into the store once; an unreadable record is reported, never silently replaced. */
export function initDeviceStudy(): string | null {
  try {
    deviceStudy.refresh();
    loadError = null;
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Your device's study data couldn't be read.";
  }
  return loadError;
}

export function deviceStudyLoadError() {
  return loadError;
}

export function useDeviceStudy(): DeviceStudy {
  const subscribe = useCallback((listener: () => void) => deviceStudy.subscribe(listener), []);
  return useSyncExternalStore(subscribe, deviceStudy.getSnapshot, () => EMPTY_DEVICE_STUDY);
}

/** Runs a store write and returns its error message, or null when it was saved. */
export function attempt(write: () => void): string | null {
  try {
    write();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Couldn't save on this device.";
  }
}
