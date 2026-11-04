import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  BIBLE_COMPARISONS_STORAGE_KEY,
  readSavedComparisons,
  removeSavedComparison,
  writeSavedComparisons,
} from "../src/lib/bibleComparisons";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("saved Bible comparisons", () => {
  beforeEach(() => {
    vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: memoryStorage() }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("a device without a choice compares nothing", () => {
    expect(readSavedComparisons()).toEqual([]);
  });

  test("a choice is read back in order and announced to open readers", () => {
    const changed = vi.fn();
    window.addEventListener("vt-bible-comparisons-change", changed);
    expect(writeSavedComparisons(["BSB", "eng_net"])).toBe(true);
    expect(readSavedComparisons()).toEqual(["BSB", "eng_net"]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  test("turning every Bible off is remembered rather than forgotten", () => {
    writeSavedComparisons(["BSB"]);
    writeSavedComparisons([]);
    expect(window.localStorage.getItem(BIBLE_COMPARISONS_STORAGE_KEY)).toBe("[]");
    expect(readSavedComparisons()).toEqual([]);
  });

  test("removing a Bible matches its id without case and keeps the others", () => {
    writeSavedComparisons(["BSB", "eng_net"]);
    expect(removeSavedComparison("bsb")).toBe(true);
    expect(readSavedComparisons()).toEqual(["eng_net"]);
  });

  test("removing a Bible that was not being compared changes nothing", () => {
    writeSavedComparisons(["eng_net"]);
    const changed = vi.fn();
    window.addEventListener("vt-bible-comparisons-change", changed);
    expect(removeSavedComparison("BSB")).toBe(true);
    expect(changed).not.toHaveBeenCalled();
  });

  test("a device that refuses to save reports it and announces nothing", () => {
    const changed = vi.fn();
    window.addEventListener("vt-bible-comparisons-change", changed);
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(writeSavedComparisons(["BSB"])).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });
});
