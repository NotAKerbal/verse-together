import { describe, expect, test } from "vitest";
import { FAITH_TRADITIONS, normalizeFaithTradition, isLdsContentPath, isLdsVolume } from "../src/lib/faithTradition";

describe("faith tradition content policy", () => {
  test("keeps existing content by default and uses stable, extensible choices", () => {
    expect(normalizeFaithTradition(null)).toBe("latter-day-saint");
    expect(normalizeFaithTradition("unknown")).toBe("latter-day-saint");
    for (const option of FAITH_TRADITIONS) expect(normalizeFaithTradition(option.id)).toBe(option.id);
    expect(normalizeFaithTradition("other")).toBe("other");
  });
  test("recognizes Latter-day Saint volumes, including canonical URL aliases", () => {
    for (const volume of ["bookofmormon", "doctrineandcovenants", "dnc", "pearl"]) expect(isLdsVolume(volume)).toBe(true);
    for (const volume of ["oldtestament", "old-testament", "newtestament", "new-testament"]) expect(isLdsVolume(volume)).toBe(false);
  });
  test("direct links cannot bypass hidden content", () => {
    for (const path of ["/browse/bookofmormon", "/browse/dnc/doctrineandcovenants/4#v-3", "/browse/pearl/moses/1?compare=kjv", "/come-follow-me", "/come-follow-me/2026-10-26", "/feed", "/talk/123", "/share/bookofmormon/alma/32/1"]) {
      expect(isLdsContentPath(path), path).toBe(true);
    }
  });
  test("Bible reading, search, settings, and personal work stay accessible", () => {
    for (const path of ["/browse", "/browse/newtestament/john/3", "/browse/old-testament/genesis/1", "/search?q=faith", "/account#reading", "/notes", "/plans/new", "/share/newtestament/john/3/16"]) {
      expect(isLdsContentPath(path), path).toBe(false);
    }
  });
});
