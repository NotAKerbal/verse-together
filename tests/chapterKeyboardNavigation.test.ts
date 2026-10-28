import { describe, expect, test } from "vitest";
import { chapterArrowHref } from "../src/lib/chapterKeyboardNavigation";

const event = {
  key: "ArrowRight", defaultPrevented: false, repeat: false, isComposing: false,
  altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
};
const reader = { prevHref: "/browse/oldtestament/genesis/1?translation=kjv", nextHref: "/browse/oldtestament/genesis/3?translation=kjv", desktop: true, blocked: false };

describe("desktop chapter arrow navigation", () => {
  test("uses the reader's adjacent hrefs including translation parameters", () => {
    expect(chapterArrowHref(event, reader)).toBe(reader.nextHref);
    expect(chapterArrowHref({ ...event, key: "ArrowLeft" }, reader)).toBe(reader.prevHref);
  });
  test("does nothing at chapter boundaries or for vertical scrolling keys", () => {
    expect(chapterArrowHref(event, { ...reader, nextHref: undefined })).toBeUndefined();
    expect(chapterArrowHref({ ...event, key: "ArrowLeft" }, { ...reader, prevHref: undefined })).toBeUndefined();
    expect(chapterArrowHref({ ...event, key: "ArrowDown" }, reader)).toBeUndefined();
  });
  test.each(["defaultPrevented", "repeat", "isComposing", "altKey", "ctrlKey", "metaKey", "shiftKey"])("leaves %s presses to their existing behavior", (flag) => {
    expect(chapterArrowHref({ ...event, [flag]: true }, reader)).toBeUndefined();
  });
  test("leaves mobile and active study interactions alone", () => {
    expect(chapterArrowHref(event, { ...reader, desktop: false })).toBeUndefined();
    expect(chapterArrowHref(event, { ...reader, blocked: true })).toBeUndefined();
  });
});
