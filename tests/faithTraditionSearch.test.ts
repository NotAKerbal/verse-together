import { beforeEach, expect, test, vi } from "vitest";
vi.mock("../src/lib/browserScriptureStorage", () => ({
  ensureBrowserScriptureStorage: vi.fn(), getBrowserScriptureStorageStatus: vi.fn(),
  resolveBrowserScriptureReference: vi.fn(async () => []),
  searchBrowserScriptures: vi.fn(async () => []),
}));
import { searchBrowserScriptures, resolveBrowserScriptureReference } from "../src/lib/browserScriptureStorage";
import { searchLocalScriptures } from "../src/lib/localScriptureSearch";
beforeEach(() => vi.clearAllMocks());
test("Bible-only text searches constrain each corpus before applying the result limit", async () => {
  await searchLocalScriptures("faith", { bibleOnly: true });
  expect(vi.mocked(searchBrowserScriptures).mock.calls.map((call) => call[1]?.volume).sort()).toEqual(["newtestament", "oldtestament"]);
});
test("Bible-only reference searches exclude Latter-day Saint direct jumps", async () => {
  const result = await searchLocalScriptures("Alma 32", { bibleOnly: true });
  expect(result.referenceResults).toEqual([]);
  expect(vi.mocked(resolveBrowserScriptureReference).mock.calls.every((call) => ["oldtestament", "newtestament"].includes(call[1]?.volume ?? ""))).toBe(true);
});
test("the default search still uses all volumes", async () => {
  const result = await searchLocalScriptures("Alma 32");
  expect(result.referenceResults.length).toBeGreaterThan(0);
  expect(vi.mocked(searchBrowserScriptures).mock.calls[0][1]?.volume).toBeUndefined();
});
