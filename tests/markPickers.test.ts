import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

const convex = vi.hoisted(() => ({
  saved: undefined as unknown,
  save: vi.fn(async (args: { presets: unknown }) => ({ markPresets: args.presets })),
}));
vi.mock("convex/react", () => ({
  useQuery: () => convex.saved,
  useMutation: () => Object.assign(convex.save, { withOptimisticUpdate: () => convex.save }),
}));
// The app's "@/" paths, which the shared Vitest config doesn't alias.
vi.mock("@/lib/selectionPopover", () => import("../src/lib/selectionPopover"));
vi.mock("@/lib/preferences", () => import("../src/lib/preferences"));
vi.mock("@/lib/appData", () => ({ getReaderPreferences: vi.fn(), saveReaderPreferences: vi.fn() }));
vi.mock("@/features/annotations/MarkSample", () => import("../src/features/annotations/MarkSample"));
vi.mock("@/features/annotations/MarkStylePicker", () => import("../src/features/annotations/MarkStylePicker"));
vi.mock("@/features/annotations/verseAnnotations", () => import("../src/features/annotations/verseAnnotations"));
vi.mock("@/app/account/page.module.css", () => import("../src/app/account/page.module.css"));
vi.mock("@/features/notes/useConvexSignedIn", () => ({ useConvexSignedIn: () => ({ user: { id: "u" }, ready: true, loading: false }) }));

import VerseActionBar, { AnnotatePanel, markAction, type VerseQuickMarks } from "../src/components/VerseActionBar";
import MarkStylePicker from "../src/features/annotations/MarkStylePicker";
import QuickMarkSettings from "../src/features/annotations/QuickMarkSettings";
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

const blessings: MarkPreset = { kind: "highlight", color: "yellow", name: "Blessings" };
const redUnderline: MarkPreset = { kind: "underline", color: "red" };

function quickMarks(extra: Partial<VerseQuickMarks> = {}): VerseQuickMarks {
  return {
    presets: [blessings, redUnderline],
    marks: selectionMarks([row(1), row(2)]),
    status: "ready",
    onMark: vi.fn(),
    onSignIn: vi.fn(),
    ...extra,
  };
}

/** Each element's opening tag that matches. */
function tags(html: string, pattern: RegExp) {
  return (html.match(/<[a-z0-9]+\b[^>]*>/g) ?? []).filter((tag) => pattern.test(tag));
}

describe("MarkStylePicker", () => {
  test("two radio groups, the chosen style and color checked and the only stops for Tab", () => {
    const html = renderToStaticMarkup(
      createElement(MarkStylePicker, { value: { kind: "underline", color: "blue" }, onChange: () => {}, label: "Quick mark 2" })
    );
    expect(html).toContain('role="radiogroup" aria-label="Quick mark 2 style"');
    expect(html).toContain('role="radiogroup" aria-label="Quick mark 2 color"');
    const radios = tags(html, /role="radio"/);
    expect(radios).toHaveLength(8);
    const checked = tags(html, /aria-checked="true"/);
    expect(checked).toHaveLength(2);
    expect(checked.every((tag) => tag.includes('tabindex="0"'))).toBe(true);
    expect(tags(html, /tabindex="0"/)).toHaveLength(2);
    expect(checked[1]).toContain('aria-label="Blue"');
    // Swatches draw as the chosen kind.
    expect(html).toContain('class="mark-picker" data-kind="underline"');
    expect(html).not.toContain("<select");
  });

  test("a style that is already another quick mark can't be picked, and says why", () => {
    const html = renderToStaticMarkup(
      createElement(MarkStylePicker, {
        value: { kind: "highlight", color: "yellow" },
        onChange: () => {},
        label: "New quick mark",
        unavailable: ({ kind, color }) => (kind === "underline" || color === "green" ? "already quick mark 1" : null),
      })
    );
    const green = tags(html, /data-color="green"/)[0];
    expect(green).toContain('aria-disabled="true"');
    expect(green).toContain('aria-label="Green, already quick mark 1"');
    // Every underline color taken: the kind itself can't be picked.
    const underline = tags(html, /class="mark-picker-kind"/)[1];
    expect(underline).toContain('aria-disabled="true"');
    expect(tags(html, /data-color="blue"/)[0]).not.toContain("aria-disabled");
  });
});

describe("selection menu", () => {
  const props = {
    visible: true,
    anchorRect: { top: 10, left: 10, right: 20, bottom: 20, width: 10, height: 10 },
    hasSelection: true,
    hasActiveInsight: false,
    selectionReference: "Ruth 1:16–17",
    selectedText: "Whither thou goest",
    onClear: () => {},
    onInsight: () => {},
    onNewInsight: () => {},
    onAnnotation: () => {},
    onResources: () => {},
  };

  test("every header button is only its mark; a named preset's name and style are in its label and tooltip", () => {
    const html = renderToStaticMarkup(createElement(VerseActionBar, { ...props, quickMarks: quickMarks() }));
    const [named, plain] = tags(html, /class="selection-preset"/);
    expect(named).toContain('aria-label="Blessings (yellow highlight)"');
    expect(named).toContain('title="Blessings (yellow highlight)"');
    expect(plain).toContain('aria-label="Red underline"');
    expect(html).not.toContain("data-named");
    expect(html).not.toContain("selection-preset-name");
    expect(html).not.toContain(">Blessings<");
    // The footer is still the passage, and Annotate still opens from the actions.
    expect(html).toContain('<h2 id="');
    expect(html).toContain("Ruth 1:16–17</h2>");
    expect(html).toContain(">Annotate<");
  });

  test("Annotate stays available while marks save; only signing out disables it", () => {
    const pending = renderToStaticMarkup(createElement(VerseActionBar, { ...props, quickMarks: quickMarks({ pending: true }), annotationDisabled: true }));
    expect(pending).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Annotate/);
    const signedOut = renderToStaticMarkup(createElement(VerseActionBar, { ...props, actionsEnabled: false, quickMarks: quickMarks({ status: "signedOut" }) }));
    expect(signedOut).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Annotate/);
  });
});

describe("Annotate panel", () => {
  const panel = (marks: VerseQuickMarks, extra: Partial<Parameters<typeof AnnotatePanel>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(AnnotatePanel, {
        quickMarks: marks,
        noteLabel: "Write a note",
        noteDescription: "Note and marks together",
        noteDisabled: false,
        onNote: () => {},
        onBack: () => {},
        onClear: () => {},
        ...extra,
      })
    );

  test("lists the saved presets in full, any style and color with Apply, and the note editor", () => {
    const html = panel(quickMarks({ marks: selectionMarks([row(1, { highlight_color: "yellow" }), row(2)]) }));
    expect(html).toContain('aria-label="Back to selection actions"');
    expect(html).toContain('aria-label="Clear selection"');
    const presets = tags(html, /class="selection-annotate-preset"/);
    expect(presets).toHaveLength(2);
    expect(presets[0]).toContain('aria-pressed="mixed"');
    expect(presets[1]).toContain('aria-pressed="false"');
    expect(html).toContain('<span class="selection-annotate-preset-label">Blessings (yellow highlight)</span>');
    expect(html).toContain('<span class="selection-annotate-preset-label">Red underline</span>');
    // The custom choice starts from the first preset's style; on some verses, so Apply puts it on all.
    expect(html).toContain('aria-label="Mark style"');
    expect(html).toContain('aria-label="Mark color"');
    expect(html).toContain("<span>Apply yellow highlight</span>");
    expect(html).toContain("On some selected verses");
    expect(html).toContain("Write a note");
    expect(tags(html, /selection-annotate-note/)[0]).not.toContain("aria-disabled");
  });

  test("Apply removes a mark every selected verse has; the note waits while marks save", () => {
    const html = panel(quickMarks({ marks: selectionMarks([row(1, { highlight_color: "yellow" })]) }), { noteDisabled: true, noteDescription: "Saving marks…" });
    expect(html).toContain("<span>Remove yellow highlight</span>");
    expect(html).toContain("On every selected verse");
    expect(tags(html, /selection-annotate-note/)[0]).toContain('aria-disabled="true"');
    expect(html).toContain("Saving marks…");
  });

  test("loading and signed-out marks stay focusable and say why; no presets still offers every mark", () => {
    const loading = panel(quickMarks({ status: "loading" }));
    expect(tags(loading, /class="selection-annotate-(preset|apply)"/).every((tag) => tag.includes('aria-disabled="true"'))).toBe(true);
    expect(loading).toContain('title="Loading your marks…"');
    const signedOut = panel(quickMarks({ status: "signedOut" }));
    expect(signedOut).toContain('title="Sign in to mark verses"');
    const none = panel(quickMarks({ presets: [] }));
    expect(none).toContain("No quick marks saved");
    expect(none).toContain("<span>Apply yellow highlight</span>");
  });

  test("a mark applies through onMark, asks a signed-out reader to sign in, and waits while loading", () => {
    const ready = quickMarks();
    const custom = { kind: "underline", color: "purple" } as const;
    markAction(ready)(custom);
    expect(ready.onMark).toHaveBeenCalledWith(custom);
    const signedOut = quickMarks({ status: "signedOut" });
    markAction(signedOut)(blessings);
    expect(signedOut.onSignIn).toHaveBeenCalled();
    expect(signedOut.onMark).not.toHaveBeenCalled();
    const loading = quickMarks({ status: "loading" });
    markAction(loading)(blessings);
    expect(loading.onMark).not.toHaveBeenCalled();
    expect(loading.onSignIn).not.toHaveBeenCalled();
  });
});

describe("account quick-mark settings", () => {
  test("each preset has a name field and a visual style and color picker, with no dropdowns", () => {
    convex.saved = { showFootnotes: true, fontScale: 1, fontFamily: "serif", comparisonView: "inline", markPresets: [blessings, redUnderline] };
    const html = renderToStaticMarkup(createElement(QuickMarkSettings));
    expect(html).not.toContain("<select");
    const names = tags(html, /<input/);
    expect(names).toHaveLength(3); // two presets and the add row
    expect(names[0]).toContain('aria-label="Quick mark 1 name"');
    expect(names[0]).toContain('value="Blessings"');
    expect(names[0]).toContain('maxLength="40"');
    expect(names[1]).toContain('value=""');
    expect(names[2]).toContain('aria-label="New quick mark name"');
    expect(html).toContain('aria-label="Quick mark 1 style"');
    expect(html).toContain('aria-label="Quick mark 2 color"');
    expect(html).toContain('aria-label="New quick mark color"');
    expect(html).toContain('aria-label="Move Blessings (yellow highlight) down"');
    expect(html).toContain('aria-label="Remove red underline"');
    // The add row offers the next free mark (a red highlight); the yellow highlight is quick mark 1 already.
    expect(html).toContain("Add red highlight");
    expect(html).toContain('aria-label="Yellow, already quick mark 1"');
    expect(html).toContain("up to 40 characters");
  });

  test("named defaults are not the defaults: Restore defaults can clear the names", () => {
    convex.saved = { showFootnotes: true, fontScale: 1, fontFamily: "serif", comparisonView: "inline", markPresets: undefined };
    const plain = renderToStaticMarkup(createElement(QuickMarkSettings));
    expect(plain).toMatch(/aria-disabled="true"[^>]*>Restore defaults/);
    convex.saved = {
      showFootnotes: true,
      fontScale: 1,
      fontFamily: "serif",
      comparisonView: "inline",
      markPresets: [
        { kind: "highlight", color: "yellow", name: "Blessings" },
        { kind: "highlight", color: "blue" },
        { kind: "highlight", color: "green" },
        { kind: "highlight", color: "pink" },
        { kind: "highlight", color: "purple" },
        { kind: "underline", color: "red" },
      ],
    };
    const named = renderToStaticMarkup(createElement(QuickMarkSettings));
    expect(named).not.toMatch(/aria-disabled="true"[^>]*>Restore defaults/);
  });
});
