import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const remote = vi.hoisted(() => ({
  getReaderPreferences: vi.fn(),
  saveReaderPreferences: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/appData", () => remote);

import {
  getDefaultPreferences,
  loadPreferences,
  normalizePreferences,
  readLocalMarkPresetsSnapshot,
  readLocalPreferences,
  savePreferences,
  subscribeLocalPreferences,
  writeLocalMarkPresets,
} from "../src/lib/preferences";

const greenUnderline = { kind: "underline" as const, color: "green" as const };
const redUnderline = { kind: "underline" as const, color: "red" as const };
const yellowHighlight = { kind: "highlight" as const, color: "yellow" as const };

function fakeStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items,
  };
}

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal("window", { localStorage: storage });
  remote.getReaderPreferences.mockReset();
  remote.saveReaderPreferences.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reader preferences on this device", () => {
  test("presets default, keep an empty list, and carry over this device's earlier quick-mark choice", () => {
    expect(getDefaultPreferences().markPresets).toHaveLength(6);
    expect(normalizePreferences(null).markPresets).toEqual(getDefaultPreferences().markPresets);
    expect(normalizePreferences({ markPresets: [] }).markPresets).toEqual([]);
    expect(normalizePreferences({ quickMarks: ["underline", "yellow"] }).markPresets).toEqual([yellowHighlight, redUnderline]);
    expect(normalizePreferences({ markPresets: [greenUnderline, greenUnderline, { kind: "x", color: "red" }] as never }).markPresets).toEqual([
      greenUnderline,
    ]);
  });

  test("a stored copy from the earlier build reads its quick marks as presets, and its reader settings unchanged", () => {
    storage.setItem(
      "reader_prefs_v1",
      JSON.stringify({ showFootnotes: false, fontScale: 1.2, fontFamily: "sans", comparisonView: "sideBySide", textWidth: "wide", quickMarks: ["blue"] })
    );
    expect(readLocalPreferences()).toEqual({
      showFootnotes: false,
      fontScale: 1.2,
      fontFamily: "sans",
      comparisonView: "sideBySide",
      textWidth: "wide",
      markPresets: [{ kind: "highlight", color: "blue" }],
    });
  });

  test("the account's presets update this device's copy without touching its reader settings, and a settings save keeps them", async () => {
    const settings = { ...getDefaultPreferences(), fontScale: 1.2, fontFamily: "sans" as const };
    await savePreferences(null, settings);
    writeLocalMarkPresets([greenUnderline, yellowHighlight]);
    expect(readLocalPreferences()).toMatchObject({ fontScale: 1.2, fontFamily: "sans", markPresets: [greenUnderline, yellowHighlight] });

    // A reader-settings save (with a stale copy of the presets) never changes them, and never sends them.
    await savePreferences("user", { ...settings, textWidth: "full", markPresets: [] }, "token");
    expect(readLocalPreferences()).toMatchObject({ textWidth: "full", markPresets: [greenUnderline, yellowHighlight] });
    expect(remote.saveReaderPreferences).toHaveBeenCalledWith("token", {
      showFootnotes: true,
      fontScale: 1.2,
      fontFamily: "sans",
      comparisonView: "inline",
      textWidth: "full",
    });

    writeLocalMarkPresets([]);
    expect(readLocalPreferences()?.markPresets).toEqual([]);
  });

  test("guest preset edits persist without an account and report blocked device storage", () => {
    expect(writeLocalMarkPresets([{ ...greenUnderline, name: "Promises" }])).toBe(true);
    expect(readLocalPreferences()?.markPresets).toEqual([{ ...greenUnderline, name: "Promises" }]);
    expect(remote.saveReaderPreferences).not.toHaveBeenCalled();

    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    expect(writeLocalMarkPresets([])).toBe(false);
    expect(readLocalPreferences()?.markPresets).toEqual([{ ...greenUnderline, name: "Promises" }]);
  });

  test("an account read cannot replace a setting changed while it was in flight", async () => {
    const stale = getDefaultPreferences();
    let finishRead!: (value: typeof stale) => void;
    remote.getReaderPreferences.mockImplementationOnce(() => new Promise<typeof stale>((resolve) => { finishRead = resolve; }));
    const loading = loadPreferences("user", "token");
    await vi.waitFor(() => expect(remote.getReaderPreferences).toHaveBeenCalledOnce());
    const changed = { ...stale, fontScale: 1.2 };
    await savePreferences("user", changed, "token");
    finishRead(stale);
    expect(await loading).toEqual(changed);
    expect(readLocalPreferences()).toEqual(changed);
  });

  test("an account read cannot replace presets changed while it was in flight", async () => {
    const stale = getDefaultPreferences();
    let finishRead!: (value: typeof stale) => void;
    remote.getReaderPreferences.mockImplementationOnce(() => new Promise<typeof stale>((resolve) => { finishRead = resolve; }));
    const loading = loadPreferences("user", "token");
    await vi.waitFor(() => expect(remote.getReaderPreferences).toHaveBeenCalledOnce());
    writeLocalMarkPresets([greenUnderline]);
    finishRead(stale);
    expect((await loading).markPresets).toEqual([greenUnderline]);
    expect(readLocalPreferences()?.markPresets).toEqual([greenUnderline]);
  });

  test("an account read cannot replace settings written by another tab", async () => {
    const stale = getDefaultPreferences();
    let finishRead!: (value: typeof stale) => void;
    remote.getReaderPreferences.mockImplementationOnce(() => new Promise<typeof stale>((resolve) => { finishRead = resolve; }));
    const loading = loadPreferences("user", "token");
    await vi.waitFor(() => expect(remote.getReaderPreferences).toHaveBeenCalledOnce());
    const changed = { ...stale, fontScale: 1.25 };
    storage.setItem("reader_prefs_v1", JSON.stringify(changed));
    finishRead(stale);
    expect(await loading).toEqual(changed);
    expect(readLocalPreferences()).toEqual(changed);
  });

  test("loading from the account reads its presets", async () => {
    remote.getReaderPreferences.mockResolvedValue({
      showFootnotes: true,
      fontScale: 1,
      fontFamily: "serif",
      comparisonView: "inline",
      textWidth: "comfortable",
      markPresets: [redUnderline],
    });
    expect((await loadPreferences("user", "token")).markPresets).toEqual([redUnderline]);
    expect(readLocalPreferences()?.markPresets).toEqual([redUnderline]);
  });

  test("preset names survive this device's copy, the account's read, and a settings save; blank names are dropped", async () => {
    const blessings = { ...yellowHighlight, name: "Blessings" };
    expect(normalizePreferences({ markPresets: [{ ...yellowHighlight, name: "  Blessings " }, { ...redUnderline, name: " " }] }).markPresets).toEqual([
      blessings,
      redUnderline,
    ]);
    writeLocalMarkPresets([blessings, { ...greenUnderline, name: "" }]);
    expect(readLocalPreferences()?.markPresets).toEqual([blessings, greenUnderline]);
    await savePreferences(null, { ...getDefaultPreferences(), fontScale: 1.1 });
    expect(readLocalPreferences()?.markPresets).toEqual([blessings, greenUnderline]);

    remote.getReaderPreferences.mockResolvedValue({
      showFootnotes: true,
      fontScale: 1,
      fontFamily: "serif",
      comparisonView: "inline",
      textWidth: "comfortable",
      markPresets: [{ ...redUnderline, name: "Commandments" }],
    });
    expect((await loadPreferences("user", "token")).markPresets).toEqual([{ ...redUnderline, name: "Commandments" }]);
    expect(readLocalPreferences()?.markPresets).toEqual([{ ...redUnderline, name: "Commandments" }]);
  });
  test("this device's presets are followed live: a write in this tab notifies, and an unchanged copy reads as the same list", () => {
    const events = new EventTarget();
    vi.stubGlobal("window", {
      localStorage: storage,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    });
    const custom = { kind: "highlight" as const, color: "#12ab89" as const, name: "Promises" };
    const first = readLocalMarkPresetsSnapshot();
    expect(first).toEqual(getDefaultPreferences().markPresets);
    expect(readLocalMarkPresetsSnapshot()).toBe(first);

    const onChange = vi.fn();
    const unsubscribe = subscribeLocalPreferences(onChange);
    writeLocalMarkPresets([custom, redUnderline]);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = readLocalMarkPresetsSnapshot();
    expect(next).toEqual([custom, redUnderline]);
    expect(readLocalMarkPresetsSnapshot()).toBe(next);

    // A reader-settings save keeps the presets (and so the same list), and still tells this tab.
    void savePreferences(null, { ...getDefaultPreferences(), fontScale: 1.2, markPresets: [] });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(readLocalMarkPresetsSnapshot()).toEqual([custom, redUnderline]);

    // Another tab's write arrives as a storage event for this key.
    events.dispatchEvent(Object.assign(new Event("storage"), { key: "reader_prefs_v1" }));
    events.dispatchEvent(Object.assign(new Event("storage"), { key: "something_else" }));
    expect(onChange).toHaveBeenCalledTimes(3);
    unsubscribe();
    writeLocalMarkPresets([]);
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
