import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NATIVE_HANDLE_SETTLE_MS, watchSelectionGesture } from "../src/lib/selectionGesture";

type Listener = (event: Record<string, unknown>) => void;

function fakeEventTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, listener: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    fire(type: string, event: Record<string, unknown> = {}) {
      listeners.get(type)?.forEach((listener) => listener(event));
    },
    count() {
      return [...listeners.values()].reduce((total, set) => total + set.size, 0);
    },
  };
}

const verseText = { closest: () => null };
const control = { closest: () => ({}) };

let fakeWindow: ReturnType<typeof fakeEventTarget> & { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
let fakeDocument: ReturnType<typeof fakeEventTarget> & { getSelection: () => unknown };
let selectedText: string;
let changes: boolean[];
let stop: () => void;

const press = (overrides: Record<string, unknown> = {}) =>
  fakeDocument.fire("pointerdown", { button: 0, pointerId: 1, pointerType: "mouse", target: verseText, ...overrides });
const select = (text: string) => {
  selectedText = text;
  fakeDocument.fire("selectionchange");
};
const lastChange = () => changes[changes.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  selectedText = "";
  changes = [];
  fakeWindow = Object.assign(fakeEventTarget(), {
    setTimeout: ((...args: Parameters<typeof setTimeout>) => setTimeout(...args)) as typeof setTimeout,
    clearTimeout: ((id?: Parameters<typeof clearTimeout>[0]) => clearTimeout(id)) as typeof clearTimeout,
  });
  fakeDocument = Object.assign(fakeEventTarget(), {
    getSelection: () => ({ isCollapsed: selectedText === "", toString: () => selectedText }),
  });
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", fakeDocument);
  stop = watchSelectionGesture((active) => changes.push(active));
});

afterEach(() => {
  stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("pressing to select", () => {
  test("is active from the press until the release, wherever the release lands", () => {
    press();
    expect(changes).toEqual([true]);
    fakeWindow.fire("pointerup", { pointerId: 1 });
    expect(changes).toEqual([true, false]);
  });

  test("counts a drag that begins outside the verses, in any non-control text or margin", () => {
    press({ target: { closest: () => null, id: "page-margin" } });
    expect(lastChange()).toBe(true);
  });

  test("ends when the browser cancels the pointer", () => {
    press();
    fakeWindow.fire("pointercancel", { pointerId: 1 });
    expect(lastChange()).toBe(false);
  });

  test("ends when a move shows the button was released where no pointerup arrived", () => {
    press();
    fakeWindow.fire("pointermove", { pointerId: 1, buttons: 1 });
    expect(lastChange()).toBe(true);
    fakeWindow.fire("pointermove", { pointerId: 1, buttons: 0 });
    expect(lastChange()).toBe(false);
  });

  test("ends when the context menu opens, which can swallow the pointerup", () => {
    press();
    fakeWindow.fire("contextmenu");
    expect(lastChange()).toBe(false);
  });

  test("ends when the window loses focus", () => {
    press();
    fakeWindow.fire("blur");
    expect(lastChange()).toBe(false);
  });

  test("ignores another pointer's release", () => {
    press();
    fakeWindow.fire("pointerup", { pointerId: 2 });
    expect(changes).toEqual([true]);
  });

  test("leaves secondary buttons and the menu's own controls alone", () => {
    press({ button: 2 });
    press({ target: control });
    expect(changes).toEqual([]);
  });

  test("keeps working for targets without closest", () => {
    press({ target: null });
    expect(lastChange()).toBe(true);
  });
});

describe("keyboard selection", () => {
  test("is active from Shift+Arrow until Shift is released", () => {
    fakeWindow.fire("keydown", { key: "ArrowRight", shiftKey: true, target: verseText });
    expect(lastChange()).toBe(true);
    fakeWindow.fire("keyup", { key: "ArrowRight", shiftKey: true });
    expect(lastChange()).toBe(true);
    fakeWindow.fire("keyup", { key: "Shift", shiftKey: false });
    expect(lastChange()).toBe(false);
  });

  test("recovers when Shift is released in another window", () => {
    fakeWindow.fire("keydown", { key: "End", shiftKey: true, target: verseText });
    fakeWindow.fire("blur");
    expect(lastChange()).toBe(false);
  });

  test("ignores plain arrows, other Shift chords, and keys typed in the menu's fields", () => {
    fakeWindow.fire("keydown", { key: "ArrowRight", shiftKey: false, target: verseText });
    fakeWindow.fire("keydown", { key: "Tab", shiftKey: true, target: verseText });
    fakeWindow.fire("keydown", { key: "ArrowRight", shiftKey: true, target: control });
    expect(changes).toEqual([]);
  });
});

describe("native touch selection handles", () => {
  const longPress = () => {
    press({ pointerType: "touch" });
    fakeWindow.fire("contextmenu");
    changes.length = 0;
  };

  test("stays active while the selection keeps changing, then settles", () => {
    longPress();
    select("In");
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(NATIVE_HANDLE_SETTLE_MS - 1);
    select("In the");
    vi.advanceTimersByTime(NATIVE_HANDLE_SETTLE_MS - 1);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true, false]);
  });

  test("doesn't hide the menu when the same text is restored after saving a mark", () => {
    longPress();
    select("In the");
    vi.advanceTimersByTime(NATIVE_HANDLE_SETTLE_MS);
    changes.length = 0;
    selectedText = "";
    fakeDocument.fire("selectionchange");
    select("In the");
    expect(changes).toEqual([]);
  });

  test("doesn't hide the menu for selection changes after a tap on the menu", () => {
    longPress();
    press({ pointerType: "touch", target: control });
    select("Programmatic change");
    expect(changes).toEqual([]);
  });

  test("a mouse selection changing after release, like Select All, shows at once", () => {
    press();
    fakeWindow.fire("pointerup", { pointerId: 1 });
    changes.length = 0;
    select("Everything");
    expect(changes).toEqual([]);
  });

  test("a new press takes over from the settling timer", () => {
    longPress();
    select("In");
    press({ pointerType: "touch", pointerId: 2 });
    vi.advanceTimersByTime(NATIVE_HANDLE_SETTLE_MS * 2);
    expect(changes).toEqual([true]);
    fakeWindow.fire("pointerup", { pointerId: 2 });
    expect(changes).toEqual([true, false]);
  });
});

test("stopping removes every listener and the settle timer", () => {
  press({ pointerType: "touch" });
  fakeWindow.fire("contextmenu");
  select("In");
  stop();
  expect(fakeWindow.count() + fakeDocument.count()).toBe(0);
  changes.length = 0;
  vi.advanceTimersByTime(NATIVE_HANDLE_SETTLE_MS * 2);
  expect(changes).toEqual([]);
});

describe("selection menus", () => {
  const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

  test("the chapter reader hides its menu during a gesture and doesn't dismiss the selection mid-gesture", () => {
    const reader = source("components/ChapterReader.tsx");
    expect(reader).toContain("watchSelectionGesture(setIsSelectionGestureActive)");
    expect(reader).toContain("hasSelection && !isSelectionGestureActive && !isCustomTouchSelecting");
    expect(reader).toMatch(/function onScrollDismiss\(\) \{\s+if \(isSelectionGestureActive \|\| isCustomTouchSelecting/);
    expect(reader).toContain("onTouchCancel={onTouchCancel}");
  });

  test("the phone selection handles stay above the menu so a touch can't land on the menu instead", () => {
    const popoverZ = Number(source("app/globals.css").match(/\.selection-popover \{[^}]*?z-index: (\d+);/)?.[1]);
    const handleLayerZ = Number(source("components/ChapterReader.tsx").match(/fixed inset-0 z-\[(\d+)\]">\s+\{startHandleRect/)?.[1]);
    expect(handleLayerZ).toBeGreaterThan(popoverZ);
  });

  test("Come, Follow Me's selection menus share the same gesture", () => {
    expect(source("features/comeFollowMe/useHeldSelection.ts")).toContain("watchSelectionGesture(");
  });
});
