import { describe, expect, test } from "vitest";
import { defaultBibleNotice, normalizeDefaultBible } from "../src/lib/defaultBible";

describe("default Bible", () => {
  test("missing or malformed preferences use the bundled Bible", () => {
    for (const value of [undefined, null, "", " ", "../../secret", "eng_webu; path=/", "a".repeat(121)]) {
      expect(normalizeDefaultBible(value)).toBe("lds");
    }
  });

  test("provider IDs keep their case while built-in IDs are canonical", () => {
    expect(normalizeDefaultBible(" KJV ")).toBe("kjv");
    expect(normalizeDefaultBible("LDS")).toBe("lds");
    expect(normalizeDefaultBible(" BSB ")).toBe("BSB");
    expect(normalizeDefaultBible("eng_webu")).toBe("eng_webu");
  });

  test("fallback notices describe the text actually loaded", () => {
    expect(defaultBibleNotice("BSB", "bsb")).toBeUndefined();
    expect(defaultBibleNotice("lds", "lds")).toBeUndefined();
    expect(defaultBibleNotice("eng_webu", "lds")).toContain("King James Bible (LDS edition)");
    expect(defaultBibleNotice("BSB", "kjv")).toContain("KJV instead");
  });
});
