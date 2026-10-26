import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  ready: false,
  accountPreferences: undefined as unknown,
  save: vi.fn(async () => ({ changed: 1 })),
  setVerseMarks: vi.fn(),
  promptSignIn: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: () => state.accountPreferences,
  useMutation: () => Object.assign(state.save, { withOptimisticUpdate: () => state.save }),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: state.user, promptSignIn: state.promptSignIn }) }));
vi.mock("@/lib/preferences", () => import("../src/lib/preferences"));
vi.mock("@/lib/appData", () => ({ getReaderPreferences: vi.fn(), saveReaderPreferences: vi.fn() }));
vi.mock("@/lib/selectionPopover", () => import("../src/lib/selectionPopover"));
vi.mock("@/features/annotations/MarkSample", () => import("../src/features/annotations/MarkSample"));
vi.mock("@/features/annotations/MarkStylePicker", () => import("../src/features/annotations/MarkStylePicker"));
vi.mock("@/features/annotations/verseAnnotations", () => import("../src/features/annotations/verseAnnotations"));
vi.mock("../src/features/notes/useConvexSignedIn", () => ({
  useConvexSignedIn: () => ({ user: state.user, ready: state.ready, loading: false }),
}));
vi.mock("../src/features/notes/deviceStudy", () => ({ deviceStudy: { setVerseMarks: state.setVerseMarks } }));

import VerseActionBar, { type VerseQuickMarks } from "../src/components/VerseActionBar";
import { useVerseQuickMarks, type QuickMarkWrite } from "../src/features/annotations/useVerseQuickMarks";
import { selectionMarkWrites } from "../src/features/comeFollowMe/scriptureAnnotations";
import { selectionMarks, type MarkPreset, type VerseAnnotation } from "../src/features/annotations/verseAnnotations";

const row = (verse: number, extra: Partial<VerseAnnotation> = {}): VerseAnnotation => ({
  id: `a${verse}`,
  verse,
  body: "",
  visibility: "private",
  highlight_color: null,
  user_id: "me",
  is_mine: true,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  ...extra,
});

const yellow: MarkPreset = { kind: "highlight", color: "yellow" };
const fallbackPresets: MarkPreset[] = [{ kind: "underline", color: "green", name: "From this device" }];
// Isaiah 52:15 (highlighted yellow) through 53:2, across the chapter break.
const writes = selectionMarkWrites({ volume: "oldtestament", slug: "isaiah" }, [
  { chapter: 52, verse: 15 },
  { chapter: 53, verse: 1 },
  { chapter: 53, verse: 2 },
]);
const marks = selectionMarks([row(15, { highlight_color: "yellow" }), undefined, undefined]);

/** The hook's result from one render, as a reader's selection menu would get it. */
function quickMarksFor(options: { loaded?: boolean; writes?: readonly QuickMarkWrite[] } = {}) {
  type Result = ReturnType<typeof useVerseQuickMarks>;
  const results: Result[] = [];
  function Probe({ onResult }: { onResult: (result: Result) => void }) {
    onResult(
      useVerseQuickMarks({
        selectionKey: "52:15,53:1,53:2",
        marks,
        writes: options.writes ?? writes,
        loaded: options.loaded ?? true,
        fallbackPresets,
      })
    );
    return null;
  }
  renderToStaticMarkup(createElement(Probe, { onResult: (result) => results.push(result) }));
  return results[0];
}

beforeEach(() => {
  state.user = null;
  state.ready = false;
  state.accountPreferences = undefined;
  state.save.mockClear();
  state.setVerseMarks.mockClear();
});

describe("quick marks across a chapter break", () => {
  test("a guest's mark saves on this device, every chapter with the same patch", () => {
    const { quickMarks } = quickMarksFor();
    expect(quickMarks.status).toBe("ready");
    // Guests get the default presets, never another account's.
    expect(quickMarks.presets).not.toEqual(fallbackPresets);
    quickMarks.onMark(yellow);
    expect(state.save).not.toHaveBeenCalled();
    // Yellow is on 52:15 only ("mixed"), so it goes on every selected verse, in both chapters.
    expect(state.setVerseMarks.mock.calls).toEqual([
      [{ volume: "oldtestament", book: "isaiah", chapter: 52 }, [15], { highlightColor: "yellow" }],
      [{ volume: "oldtestament", book: "isaiah", chapter: 53 }, [1, 2], { highlightColor: "yellow" }],
    ]);
  });

  test("signed in, each chapter's verses go to the account's setVerseMarks", async () => {
    state.user = { id: "u" };
    state.ready = true;
    state.accountPreferences = { markPresets: [yellow] };
    const { quickMarks } = quickMarksFor();
    expect(quickMarks.presets).toEqual([yellow]);
    quickMarks.onMark(yellow);
    await Promise.resolve();
    expect(state.setVerseMarks).not.toHaveBeenCalled();
    expect(state.save.mock.calls).toEqual([
      [{ volume: "oldtestament", book: "isaiah", chapter: 52, verses: [15], highlightColor: "yellow" }],
      [{ volume: "oldtestament", book: "isaiah", chapter: 53, verses: [1, 2], highlightColor: "yellow" }],
    ]);
  });

  test("until the account's presets load, this device's copy; until the marks load, nothing is written", () => {
    state.user = { id: "u" };
    state.ready = true;
    expect(quickMarksFor().quickMarks.presets).toEqual(fallbackPresets);
    const { quickMarks } = quickMarksFor({ loaded: false });
    expect(quickMarks.status).toBe("loading");
    quickMarks.onMark(yellow);
    expect(state.save).not.toHaveBeenCalled();
    // Signed in before the account's session reaches Convex: loading too.
    state.ready = false;
    expect(quickMarksFor().quickMarks.status).toBe("loading");
  });
});

describe("the selection menu without insights or resources", () => {
  const quickMarks: VerseQuickMarks = {
    presets: [yellow],
    marks,
    status: "ready",
    onMark: () => {},
    onSignIn: () => {},
  };

  test("offers quick marks, Annotate, and Copy, and no action the reader can't take", () => {
    // The Come, Follow Me scripture pane's props: no insight or resources handlers.
    const html = renderToStaticMarkup(
      createElement(VerseActionBar, {
        visible: true,
        anchorRect: { top: 10, left: 10, right: 20, bottom: 20, width: 10, height: 10 },
        hasSelection: true,
        selectionReference: "Isaiah 52:15; 53:1–2",
        selectedText: "So shall he sprinkle many nations",
        quickMarks,
        showInsightAction: false,
        onClear: () => {},
        onAnnotation: () => {},
      })
    );
    expect(html).toContain('aria-label="Quick marks for the selected verses"');
    expect(html).toContain(">Annotate<");
    expect(html).toContain("Copy text");
    expect(html).toContain("Isaiah 52:15; 53:1–2</h2>");
    expect(html).not.toContain("Resources");
    expect(html).not.toContain("New Note");
    expect(html).not.toContain("Explore");
    expect(html).not.toContain("Focus scripture");
  });
});

test("each chapter's exact text ranges reach guest and account storage through the shared hook", async () => {
  const rangedWrites: QuickMarkWrite[] = writes.map(write => ({
    ...write,
    ranges: write.verses.map(verse => ({ verse, start: 5, end: 9, text: "Keep this phrase" })),
  }));
  quickMarksFor({ writes: rangedWrites }).quickMarks.onMark(yellow);
  expect(state.setVerseMarks.mock.calls.map(call => call[2].ranges)).toEqual(rangedWrites.map(write => write.ranges));
  state.user = { id: "u" };
  state.ready = true;
  quickMarksFor({ writes: rangedWrites }).quickMarks.onMark(yellow);
  await Promise.resolve();
  expect(state.save.mock.calls).toEqual(rangedWrites.map(write => [{
    ...write.target, verses: [...write.verses], highlightColor: "yellow", ranges: write.ranges,
  }]));
});
