import assert from "node:assert/strict";
import test from "node:test";
import {
  aiInsightSourceHasMaterial,
  aiInsightTask,
  extractAiInsightText,
  formatAiInsightSource,
  isAiInsightAction,
} from "./aiInsights.ts";

test("recognizes only supported insight actions", () => {
  assert.equal(isAiInsightAction("themes"), true);
  assert.equal(isAiInsightAction("questions"), true);
  assert.equal(isAiInsightAction("draft"), true);
  assert.equal(isAiInsightAction("publish"), false);
});

test("uses highlighted text and preserves its scripture reference", () => {
  const source = formatAiInsightSource({
    title: "Faith",
    blocks: [
      {
        type: "scripture",
        text: "The full verse text",
        highlight_text: "The selected phrase",
        link_url: null,
        scripture_ref: {
          volume: "newtestament",
          book: "hebrews",
          chapter: 11,
          verseStart: 1,
          verseEnd: 1,
          reference: "Hebrews 11:1",
        },
        dictionary_meta: null,
      },
    ],
  });

  assert.match(source, /Note title: Faith/);
  assert.match(source, /Hebrews 11:1/);
  assert.match(source, /The selected phrase/);
  assert.doesNotMatch(source, /The full verse text/);
});

test("gives each action a distinct task", () => {
  assert.notEqual(aiInsightTask("themes"), aiInsightTask("questions"));
  assert.notEqual(aiInsightTask("questions"), aiInsightTask("draft"));
});

test("requires meaningful note material", () => {
  assert.equal(aiInsightSourceHasMaterial({ title: "Title only", blocks: [] }), false);
  assert.equal(
    aiInsightSourceHasMaterial({
      title: "A note",
      blocks: [{ type: "text", text: "A sufficiently detailed study thought.", highlight_text: null }],
    }),
    true
  );
});

test("extracts text only from assistant message output", () => {
  const text = extractAiInsightText({
    output: [
      { type: "reasoning", content: [{ type: "output_text", text: "hidden" }] },
      { type: "message", content: [{ type: "output_text", text: "First thought" }] },
      { type: "message", content: [{ type: "output_text", text: "Second thought" }] },
    ],
  });
  assert.equal(text, "First thought\n\nSecond thought");
});
