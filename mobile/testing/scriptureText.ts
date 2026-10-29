// Test helpers for the native scripture text under Jest (jest.setup.js mocks its bridge with a host element). A
// selection is made the way the native view reports one: an onSelectionChange event with UTF-16 offsets into the
// view's own text. This checks the app's mapping, state and actions, not Android's or iOS's gestures.

import { act, fireEvent, screen } from "expo-router/testing-library";
import type { NativeContent, NativeDecoration, NativeMark } from "../modules/scripture-text";

export type NativeCall = { testID?: string; call: "clearSelection" | "setSelection" | "offsetTop"; start?: number; end?: number; offset?: number };

/** What the mocked bridge recorded: calls to the native view's functions. */
export function nativeCalls(): NativeCall[] {
  return (jest.requireMock("../modules/scripture-text") as { nativeCalls: NativeCall[] }).nativeCalls;
}

export function resetNativeCalls() {
  nativeCalls().length = 0;
}

export function nativeText(testID: string | RegExp = "reader-text") {
  const view = typeof testID === "string" ? screen.getByTestId(testID) : screen.getAllByTestId(testID)[0];
  const props = view.props as { content: NativeContent; marks: NativeMark[]; decorations: NativeDecoration[]; testID: string };
  return { view, text: props.content.text, marks: props.marks, decorations: props.decorations, testID: props.testID };
}

export type Find = { occurrence?: number; through?: string; from?: string };

/**
 * The offsets of a phrase in the view's text: its `occurrence`th (0-based) after `from` (say, a verse's "21  "), or
 * from it through a later phrase.
 */
export function offsetsOf(text: string, phrase: string, { occurrence = 0, through, from }: Find = {}) {
  let start = from ? text.indexOf(from) - 1 : -1;
  if (from && start < -1) throw new Error(`"${from}" isn't in the text`);
  for (let index = 0; index <= occurrence; index++) {
    start = text.indexOf(phrase, start + 1);
    if (start < 0) throw new Error(`"${phrase}" (#${occurrence}) isn't in the text`);
  }
  let end = start + phrase.length;
  if (through) {
    const last = text.indexOf(through, start);
    if (last < 0) throw new Error(`"${through}" isn't after "${phrase}"`);
    end = last + through.length;
  }
  return { start, end };
}

/** Selects a phrase as the reader would (long press, then the handles), reported as the native view reports it. */
export async function selectText(
  phrase: string,
  { testID = "reader-text", backward = false, ...find }: Find & { testID?: string | RegExp; backward?: boolean } = {}
) {
  const { view, text } = nativeText(testID);
  const { start, end } = offsetsOf(text, phrase, find);
  await act(async () => {
    fireEvent(view, "selectionChange", { nativeEvent: backward ? { start: end, end: start } : { start, end } });
  });
  return { start, end };
}

/** The reader taps away: the native selection collapses. */
export async function collapseSelection(testID: string | RegExp = "reader-text", at = 0) {
  const { view } = nativeText(testID);
  await act(async () => {
    fireEvent(view, "selectionChange", { nativeEvent: { start: at, end: at } });
  });
}
