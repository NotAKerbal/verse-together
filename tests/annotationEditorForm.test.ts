import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import AnnotationEditorForm from "../src/features/annotations/AnnotationEditorForm";
import type { VerseTextMark } from "../convex/annotationRules";

function render(extra: Partial<Parameters<typeof AnnotationEditorForm>[0]> = {}) {
  return renderToStaticMarkup(createElement(AnnotationEditorForm, {
    title: "Annotate verse",
    placeholder: "Write a note",
    saveLabel: "Save annotation",
    savedVersion: "none",
    initialValue: { body: "", highlightColor: null, underlineColor: null },
    onSave: async () => {},
    onClose: () => {},
    ...extra,
  }));
}

function saveButton(html: string) {
  return html.match(/<button[^>]*>Save annotation<\/button>/)?.[0];
}

describe("shared annotation form safeguards", () => {
  test("a note received before the chapter finishes loading cannot be edited or saved yet", () => {
    const html = render({ loaded: false, savedVersion: null, initialValue: { body: "Saved note", highlightColor: "red", underlineColor: null } });
    expect(html).toMatch(/<textarea[^>]*disabled=""/);
    expect(saveButton(html)).toContain('disabled=""');
    expect(html).toContain("Loading your annotations…");
    expect(html).toContain("Saved note");
  });

  test("an empty annotation cannot be saved, but a note or either kind of mark can", () => {
    expect(saveButton(render())).toContain('disabled=""');
    for (const initialValue of [
      { body: "A note", highlightColor: null, underlineColor: null },
      { body: "", highlightColor: "#12ab89", underlineColor: null },
      { body: "", highlightColor: null, underlineColor: "blue" },
    ] as const) {
      expect(saveButton(render({ initialValue }))).not.toContain('disabled=""');
    }
  });

  test("existing verse text-range marks keep an otherwise empty annotation valid", () => {
    const textMarks: VerseTextMark[] = [{ start: 0, end: 4, text: "text", kind: "highlight", color: "yellow" }];
    expect(saveButton(render({ textMarks }))).not.toContain('disabled=""');
  });

  test("saved custom mark colors stay selected and both mark kinds remain independent", () => {
    const html = render({ initialValue: { body: "", highlightColor: "#12ab89", underlineColor: "blue" } });
    expect(html).toMatch(/aria-label="#12AB89 highlight"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/aria-label="Blue underline"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/<h2 id="([^"]+)"/);
    expect(html).toContain('aria-labelledby="');
  });
});
