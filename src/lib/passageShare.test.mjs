import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShareUrl,
  formatPassageReference,
  groupVerseRuns,
  parseVerseSpec,
  serializeVerseSpec,
  sharePassageLink,
} from "./passageShare.ts";

test("parses a single verse, a range, a list and a mix", () => {
  assert.deepEqual(parseVerseSpec("27", 43), [27]);
  assert.deepEqual(parseVerseSpec("21-28", 43), [21, 22, 23, 24, 25, 26, 27, 28]);
  assert.deepEqual(parseVerseSpec("21,23,27", 43), [21, 23, 27]);
  assert.deepEqual(parseVerseSpec("3,21-24", 43), [3, 21, 22, 23, 24]);
});

test("sorts, dedupes and tolerates loose formatting", () => {
  assert.deepEqual(parseVerseSpec("27, 21 - 23 ,27", 43), [21, 22, 23, 27]);
  assert.deepEqual(parseVerseSpec("28-21", 43), [21, 22, 23, 24, 25, 26, 27, 28]);
  assert.deepEqual(parseVerseSpec("5–7", 43), [5, 6, 7]);
  assert.deepEqual(parseVerseSpec("3;1", 43), [1, 3]);
});

test("clamps to the chapter and drops verse zero", () => {
  assert.deepEqual(parseVerseSpec("40-99", 43), [40, 41, 42, 43]);
  assert.deepEqual(parseVerseSpec("0-2", 43), [1, 2]);
  assert.equal(parseVerseSpec("50", 43), null);
  assert.equal(parseVerseSpec("0", 43), null);
  assert.equal(parseVerseSpec("1-3", 0), null);
});

test("rejects garbage", () => {
  assert.equal(parseVerseSpec("", 43), null);
  assert.equal(parseVerseSpec("   ", 43), null);
  assert.equal(parseVerseSpec("abc", 43), null);
  assert.equal(parseVerseSpec("1-2-3", 43), null);
  assert.equal(parseVerseSpec("1.5", 43), null);
  assert.equal(parseVerseSpec("-3", 43), null);
  assert.equal(parseVerseSpec("3-", 43), null);
  assert.equal(parseVerseSpec("1e3", 43), null);
  assert.equal(parseVerseSpec(null, 43), null);
  assert.equal(parseVerseSpec(undefined, 43), null);
});

test("serializes the shortest form with ranges", () => {
  assert.equal(serializeVerseSpec([27]), "27");
  assert.equal(serializeVerseSpec([21, 22, 23, 24, 25, 26, 27, 28]), "21-28");
  assert.equal(serializeVerseSpec([21, 23, 27]), "21,23,27");
  assert.equal(serializeVerseSpec([3, 21, 22, 23]), "3,21-23");
  assert.equal(serializeVerseSpec([23, 21, 22, 22, 3]), "3,21-23");
  assert.equal(serializeVerseSpec([1, 2]), "1-2");
  assert.equal(serializeVerseSpec([]), "");
});

test("round-trips through parse and serialize", () => {
  for (const spec of ["27", "21-28", "21,23,27", "3,21-28", "1-2,4,6-9"]) {
    assert.equal(serializeVerseSpec(parseVerseSpec(spec, 43)), spec);
  }
});

test("groups contiguous runs", () => {
  assert.deepEqual(groupVerseRuns([1, 2, 3, 7, 9, 10]), [
    { start: 1, end: 3 },
    { start: 7, end: 7 },
    { start: 9, end: 10 },
  ]);
});

test("builds share URLs with the volume URL slug", () => {
  assert.equal(
    buildShareUrl({ volume: "bookofmormon", book: "alma", chapter: 32, verses: [21, 22, 23, 24, 25, 26, 27, 28] }),
    "/share/bookofmormon/alma/32/21-28"
  );
  assert.equal(
    buildShareUrl({ volume: "doctrineandcovenants", book: "doctrineandcovenants", chapter: 4, verses: [2] }),
    "/share/dnc/doctrineandcovenants/4/2"
  );
});

test("formats human references with en dashes", () => {
  assert.equal(formatPassageReference("Alma", 32, [21, 22, 23, 24, 25, 26, 27, 28]), "Alma 32:21–28");
  assert.equal(formatPassageReference("Alma", 32, [3, 21, 22, 23, 24, 25, 26, 27, 28]), "Alma 32:3, 21–28");
  assert.equal(formatPassageReference("Alma", 32, [27]), "Alma 32:27");
  assert.equal(formatPassageReference("Alma", 32, []), "Alma 32");
});

const shareData = {
  title: "Alma 32:3, 21–28 · Verse Together",
  text: "Alma 32:3, 21–28",
  url: "https://example.test/share/bookofmormon/alma/32/3,21-28",
};

function fakeNavigator({ share, canShare, writeText } = {}) {
  const calls = { shared: [], copied: [] };
  const nav = {};
  if (share) {
    nav.share = async (data) => {
      calls.shared.push(data);
      return share(data);
    };
  }
  if (canShare) nav.canShare = canShare;
  if (writeText) {
    nav.clipboard = {
      writeText: async (text) => {
        calls.copied.push(text);
        return writeText(text);
      },
    };
  }
  return { nav, calls };
}

test("shares the passage link through the share sheet when there is one", async () => {
  const { nav, calls } = fakeNavigator({ share: () => undefined, writeText: () => undefined });
  assert.equal(await sharePassageLink(shareData, nav), "shared");
  assert.deepEqual(calls.shared, [shareData]);
  assert.deepEqual(calls.copied, []);
});

test("closing the share sheet is a cancel, with nothing copied", async () => {
  const abort = Object.assign(new Error("Share canceled"), { name: "AbortError" });
  const { nav, calls } = fakeNavigator({ share: () => Promise.reject(abort), writeText: () => undefined });
  assert.equal(await sharePassageLink(shareData, nav), "cancelled");
  assert.deepEqual(calls.copied, []);
  // A DOMException abort (what browsers throw) reads the same.
  const domAbort = new DOMException("Share canceled", "AbortError");
  const dom = fakeNavigator({ share: () => Promise.reject(domAbort), writeText: () => undefined });
  assert.equal(await sharePassageLink(shareData, dom.nav), "cancelled");
});

test("copies the exact passage link without a share sheet", async () => {
  const { nav, calls } = fakeNavigator({ writeText: () => undefined });
  assert.equal(await sharePassageLink(shareData, nav), "copied");
  assert.deepEqual(calls.copied, [shareData.url]);
});

test("copies the link when the share sheet refuses it or can't take it", async () => {
  const refused = new DOMException("Not allowed", "NotAllowedError");
  const failing = fakeNavigator({ share: () => Promise.reject(refused), writeText: () => undefined });
  assert.equal(await sharePassageLink(shareData, failing.nav), "copied");
  assert.deepEqual(failing.calls.copied, [shareData.url]);

  const unsupported = fakeNavigator({ share: () => undefined, canShare: () => false, writeText: () => undefined });
  assert.equal(await sharePassageLink(shareData, unsupported.nav), "copied");
  assert.deepEqual(unsupported.calls.shared, []);
});

test("reports a failure when neither sharing nor copying works", async () => {
  assert.equal(await sharePassageLink(shareData, undefined), "failed");
  assert.equal(await sharePassageLink(shareData, {}), "failed");
  const { nav } = fakeNavigator({ writeText: () => Promise.reject(new Error("denied")) });
  assert.equal(await sharePassageLink(shareData, nav), "failed");
});
