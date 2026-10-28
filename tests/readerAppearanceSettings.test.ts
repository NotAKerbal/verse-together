import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const remote = vi.hoisted(() => ({
  saves: [] as Array<{ fontScale: number }>,
  stored: null as null | Record<string, unknown>,
  release: [] as Array<() => void>,
}));

// The account's copy: each save waits until the test lets it land.
vi.mock("@/lib/appData", () => ({
  getReaderPreferences: async () => remote.stored,
  saveReaderPreferences: (_token: string, prefs: { fontScale: number }) =>
    new Promise<void>((resolve) => {
      remote.release.push(() => {
        remote.saves.push(prefs);
        remote.stored = { ...prefs };
        resolve();
      });
    }),
}));

import ReaderAppearanceControls from "../src/components/ReaderAppearanceControls";
import {
  getDefaultAppearance,
  getDefaultPreferences,
  isDefaultAppearance,
  loadPreferences,
  savePreferences,
} from "../src/lib/preferences";
import { CURRENT_VERSION, formatReleaseDate, RELEASES, UNRELEASED } from "../src/lib/releaseNotes";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
  };
}

async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe("reader appearance", () => {
  beforeEach(() => {
    remote.saves = [];
    remote.stored = null;
    remote.release = [];
    vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: memoryStorage() }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("defaults are recognised, and resetting keeps the other preferences", () => {
    const prefs = { ...getDefaultPreferences(), showFootnotes: false, fontScale: 1.2, fontFamily: "sans" as const };
    expect(isDefaultAppearance(prefs)).toBe(false);
    const reset = { ...prefs, ...getDefaultAppearance() };
    expect(isDefaultAppearance(reset)).toBe(true);
    expect(reset.showFootnotes).toBe(false);
    expect(reset.markPresets).toEqual(prefs.markPresets);
  });

  test("rapid saves reach the account one at a time, newest wins, and a load waits for them", async () => {
    const base = getDefaultPreferences();
    const first = savePreferences("u1", { ...base, fontScale: 1.1 }, "token");
    await flush();
    // The first is in flight; two more arrive while it is.
    expect(remote.release).toHaveLength(1);
    const second = savePreferences("u1", { ...base, fontScale: 1.2 }, "token");
    const third = savePreferences("u1", { ...base, fontScale: 1.25 }, "token");
    // Saved on this device at once.
    expect(JSON.parse(window.localStorage.getItem("reader_prefs_v1")!).fontScale).toBe(1.25);
    const loaded = loadPreferences("u1", "token");

    await flush();
    expect(remote.release).toHaveLength(1);
    remote.release.shift()!();
    await first;
    await second;
    await flush();
    // The middle save was superseded before it started; only the newest follows.
    expect(remote.release).toHaveLength(1);
    remote.release.shift()!();
    await third;
    expect(remote.saves.map((save) => save.fontScale)).toEqual([1.1, 1.25]);
    expect((await loaded).fontScale).toBe(1.25);
  });

  test("token requests resolving out of order cannot restore an older change", async () => {
    const base = getDefaultPreferences();
    let resolveOlder!: (token: string) => void;
    const olderToken = new Promise<string>((resolve) => { resolveOlder = resolve; });
    const older = savePreferences("u1", { ...base, fontScale: 1.1 }, olderToken);
    await flush();
    const newer = savePreferences("u1", { ...base, fontScale: 1.2 }, Promise.resolve("token"));
    expect(JSON.parse(window.localStorage.getItem("reader_prefs_v1")!).fontScale).toBe(1.2);
    resolveOlder("token");
    await older;
    await flush();
    expect(remote.release).toHaveLength(1);
    remote.release.shift()!();
    await newer;
    expect(remote.saves.map((save) => save.fontScale)).toEqual([1.2]);
  });

  test("the shared controls label the size slider and mark the chosen options", () => {
    const html = renderToStaticMarkup(
      createElement(ReaderAppearanceControls, {
        prefs: { ...getDefaultPreferences(), fontScale: 1.1, textWidth: "wide" },
        onChange: () => {},
        showDescriptions: true,
      })
    );
    expect(html).toContain("Text size");
    expect(html).toContain('aria-valuetext="110%"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Wide</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Serif</);
    expect(html).toContain("A wider column on large screens.");
  });
});

describe("release notes", () => {
  test("releases are versions from 2.0.0 up, newest first, each with dated items and commits", () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    expect(RELEASES.at(-1)!.version).toBe("2.0.0");
    expect(CURRENT_VERSION).toBe(RELEASES[0].version);
    const versions = RELEASES.map((release) => release.version);
    expect(new Set(versions).size).toBe(versions.length);
    RELEASES.forEach((release, index) => {
      expect(release.version).toMatch(/^2\.\d+\.0$/);
      // One minor version per dev-to-master release, with none skipped.
      expect(Number(release.version.split(".")[1])).toBe(RELEASES.length - 1 - index);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(`${release.date}T00:00:00Z`).getTime())).toBe(false);
      if (index > 0) expect(release.date <= RELEASES[index - 1].date).toBe(true);
      // The newest release is prepared before its master merge exists.
      if (index > 0 || release.masterCommit) expect(release.masterCommit).toMatch(/^[0-9a-f]{7}$/);
      expect(release.items.length).toBeGreaterThan(0);
      expect(release.commits.length).toBeGreaterThan(0);
      expect(new Set(release.items.map((item) => item.text)).size).toBe(release.items.length);
    });
  });

  test("screenshots have alt text and captions, and later captures say they show today's interface", () => {
    for (const release of RELEASES) {
      for (const { screenshot } of release.items) {
        if (!screenshot) continue;
        expect(screenshot.src).toMatch(/^\/release-notes\/[\w.-]+\.webp$/);
        expect(screenshot.alt.length).toBeGreaterThan(20);
        expect(screenshot.caption.length).toBeGreaterThan(0);
        // Reconstructed releases use later captures; new releases can show their own interface.
        if (Number(release.version.split(".")[1]) <= 10) expect(screenshot.currentInterface).toBe(true);
        else if (screenshot.currentInterface !== undefined) expect(typeof screenshot.currentInterface).toBe("boolean");
      }
    }
    for (const { screenshot } of UNRELEASED.items) {
      if (screenshot) expect(screenshot.currentInterface).toBeUndefined();
    }
  });

  test("dates read the same in every time zone", () => {
    expect(formatReleaseDate("2026-10-27")).toBe("October 27, 2026");
  });
});
