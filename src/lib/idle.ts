import type { ScheduleIdle } from "./chapterRequestCache";

/** Runs `callback` when the browser is idle (or soon, where requestIdleCallback is missing); returns a cancel. */
export const scheduleIdleTask: ScheduleIdle = (callback) => {
  if (typeof window === "undefined") return () => {};

  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(() => callback(), { timeout: 1200 });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = globalThis.setTimeout(callback, 250);
  return () => globalThis.clearTimeout(handle);
};
