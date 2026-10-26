"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { deviceStudy, EMPTY_DEVICE_STUDY } from "./deviceStudy";

export function useDeviceStudy() {
  const data = useSyncExternalStore(deviceStudy.subscribe, deviceStudy.getSnapshot, () => EMPTY_DEVICE_STUDY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => {
      try {
        deviceStudy.refresh();
        setError(null);
      } catch {
        setError("Couldn't open storage on this device. Allow browser storage to save your study.");
      }
      setLoaded(true);
    };
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  return { data, loaded, error };
}
