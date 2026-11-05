import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  favorites: [] as Array<{ id: string; label: string; language?: string; abbreviation?: string }>,
  defaultBible: "lds",
  showLdsContent: true,
}));

vi.mock("@/lib/translationFavorites", () => ({
  readFavoriteTranslations: () => state.favorites,
  useFavoriteTranslations: () => state.favorites,
  writeFavoriteTranslations: () => {},
}));
vi.mock("@/lib/useDefaultBible", () => ({
  useDefaultBible: () => [state.defaultBible, async () => {}],
}));
vi.mock("@/lib/useFaithTradition", () => ({
  useFaithTradition: () => ({ showLdsContent: state.showLdsContent }),
}));
vi.mock("@/lib/jstPreference", () => ({
  useJstPreference: () => [false, () => {}],
}));
vi.mock("@/components/TranslationCatalogPicker", () => ({
  default: () => null,
  useTranslationCatalog: () => ({ catalog: null }),
}));

import BibleTranslationControls from "../src/components/BibleTranslationControls";

const BSB = { id: "BSB", label: "Berean Standard Bible", language: "English", abbreviation: "BSB" };
const RVR = { id: "spa_rvr", label: "Reina-Valera", language: "Spanish", abbreviation: "RVR" };

function renderReader(shown: string[] = []) {
  return renderToStaticMarkup(createElement(BibleTranslationControls, { shown, onShownChange: () => {} }));
}

function renderSettings() {
  return renderToStaticMarkup(createElement(BibleTranslationControls));
}

describe("Bibles in the reader menu", () => {
  beforeEach(() => {
    state.favorites = [BSB, RVR];
    state.defaultBible = "lds";
    state.showLdsContent = true;
  });

  test("uses one heading and leaves out the explanations", () => {
    state.favorites = [];
    const html = renderReader();
    expect(html.match(/<h3/g)).toHaveLength(1);
    expect(html).toContain(">Your Bibles</h3>");
    expect(html).not.toContain("Your default Bible is the main text");
    expect(html).not.toContain("Add a Bible to read it verse by verse");
    expect(html).not.toContain("Open Your Bibles in a larger view");
    expect(html).toContain("+ Add Bible");
  });

  test("rows name the Bible without repeating English or offline details", () => {
    const html = renderReader();
    expect(html).toContain("King James Bible (LDS edition)");
    expect(html).toContain("Berean Standard Bible");
    expect(html).not.toContain("Available offline");
    expect(html).not.toContain("English");
    expect(html).not.toContain(">BSB<");
    expect(html).toContain("> · Spanish</span>");
  });

  test("each saved Bible can be made default, compared and removed", () => {
    const html = renderReader(["BSB"]);
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Use King James Bible \(LDS edition\) as default"[^>]*>Default</);
    expect(html).toMatch(/aria-pressed="false"[^>]*aria-label="Use Berean Standard Bible as default"[^>]*>Make default</);
    expect(html).toMatch(/role="switch" aria-checked="true" aria-label="Compare Berean Standard Bible" data-bible-id="BSB"/);
    expect(html).toMatch(/role="switch" aria-checked="false" aria-label="Compare Reina-Valera"/);
    expect(html).toContain('aria-label="Remove Berean Standard Bible"');
    expect(html).toContain('aria-label="Remove Reina-Valera"');
    expect(html).not.toContain('aria-label="Remove King James Bible');
    expect(html.match(/>Compare</g)).toHaveLength(2);
  });

  test("the default Bible has no compare switch and takes focus on its remove button", () => {
    state.defaultBible = "BSB";
    const html = renderReader();
    expect(html).not.toContain('aria-label="Compare Berean Standard Bible"');
    expect(html).toMatch(/data-bible-id="BSB"[^>]*aria-label="Remove Berean Standard Bible"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Use Berean Standard Bible as default"[^>]*>Default</);
  });

  test("a compared Bible that isn't saved offers Save and stays comparable", () => {
    state.favorites = [];
    const html = renderReader(["BSB"]);
    expect(html).toContain('aria-label="Save Berean Standard Bible"');
    expect(html).toContain('aria-label="Compare Berean Standard Bible"');
    expect(html).not.toContain('aria-label="Remove Berean Standard Bible"');
    expect(html).not.toContain('aria-label="Use Berean Standard Bible as default"');
  });

  test("the Joseph Smith Translation is a visible, concise switch with no disclosure", () => {
    const html = renderReader();
    expect(html).not.toMatch(/<details|<summary/);
    expect(html).toContain(">Joseph Smith Translation</p>");
    expect(html).toMatch(/role="switch" aria-checked="false" aria-label="Joseph Smith Translation \(JST\)"/);
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("When the LDS edition is the main text");
    expect(html).not.toContain(">Source</a>");
  });

  test("the Joseph Smith Translation stays available for Latter-day Saint readers only", () => {
    expect(renderReader()).toContain('aria-label="Joseph Smith Translation (JST)"');
    state.showLdsContent = false;
    expect(renderReader()).not.toContain("Joseph Smith Translation");
  });
});

describe("Bibles on the Settings page", () => {
  beforeEach(() => {
    state.favorites = [BSB];
    state.defaultBible = "lds";
    state.showLdsContent = true;
  });

  test("keeps the fuller details and larger view, with no compare switches", () => {
    const html = renderSettings();
    expect(html).toContain("Your default Bible is the main text");
    expect(html).toContain("English · Available offline");
    expect(html).toContain("English · BSB");
    expect(html).toContain("Open Your Bibles in a larger view");
    expect(html).not.toContain('role="switch" aria-checked="false" aria-label="Compare');
  });

  test("explains an empty list", () => {
    state.favorites = [];
    expect(renderSettings()).toContain("Add a Bible to read it verse by verse");
  });

  test("shows the Joseph Smith Translation switch with its explanation and source", () => {
    const html = renderSettings();
    expect(html).not.toMatch(/<details|<summary/);
    expect(html).toContain(">Joseph Smith Translation</p>");
    expect(html).toContain("When the LDS edition is the main text");
    expect(html).toContain(">Source</a>");
    const descriptionId = html.match(/aria-label="Joseph Smith Translation \(JST\)" aria-describedby="([^"]+)"/)?.[1];
    expect(descriptionId).toBeTruthy();
    expect(html).toContain(`<p id="${descriptionId}"`);
  });

  test("hides the Joseph Smith Translation from other faith traditions", () => {
    state.showLdsContent = false;
    const html = renderSettings();
    expect(html).not.toContain("Joseph Smith Translation");
    expect(html).not.toContain(">Source</a>");
  });
});
