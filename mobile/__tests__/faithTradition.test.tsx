// The faith tradition through the real router and storage: kept under the web's key with the web's rules, chosen in
// Settings → Reading, and, for Other denominations, Latter-day Saint volumes, Come, Follow Me and their search
// results left out, with the web's notice on a direct route to them.

import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { visibleResults } from "../app/search";
import { visibleNav } from "../src/components/FloatingNav";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { FAITH_TRADITION_STORAGE_KEY, faithTradition, showsLdsContent } from "../src/storage/faithTradition";
import { lastPosition, readerPreferences, simpleMode } from "../src/storage/preferences";
import { initDeviceStudy } from "../src/storage/study";

let port: ReturnType<typeof memoryStorage>;

async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
}

beforeEach(() => {
  port = memoryStorage();
  setStoragePort(port);
  faithTradition.reset();
  readerPreferences.reset();
  simpleMode.reset();
  lastPosition.reset();
  initDeviceStudy();
});

describe("faith tradition storage", () => {
  it("defaults to Latter-day Saint content and reads the web's values back after a restart", () => {
    expect(faithTradition.get()).toBe("latter-day-saint");
    expect(showsLdsContent()).toBe(true);

    expect(faithTradition.set("other")).toBe(true);
    expect(port.data.get(FAITH_TRADITION_STORAGE_KEY)).toBe("other");
    faithTradition.reset();
    expect(faithTradition.get()).toBe("other");
    expect(showsLdsContent()).toBe(false);

    // Anything else stored there is the default, as normalizeFaithTradition reads it.
    port.setItem(FAITH_TRADITION_STORAGE_KEY, "unknown");
    faithTradition.reset();
    expect(faithTradition.get()).toBe("latter-day-saint");
  });

  it("refuses a write the device rejects and keeps the choice it had", () => {
    port.setItem = () => {
      throw new Error("disk full");
    };
    expect(faithTradition.set("other")).toBe(false);
    expect(faithTradition.get()).toBe("latter-day-saint");
  });

  it("leaves Come Follow Me out of the navigation and LDS results out of search", () => {
    expect(visibleNav(true).map((item) => item.route)).toEqual(["browse", "notes", "come-follow-me"]);
    expect(visibleNav(false).map((item) => item.route)).toEqual(["browse", "notes"]);

    const results = {
      references: [
        { id: "a", label: "Alma 32", volume: "bookofmormon", book: "alma", chapter: 32, volumeTitle: "Book of Mormon" },
        { id: "j", label: "John 3", volume: "newtestament", book: "john", chapter: 3, volumeTitle: "New Testament" },
      ],
      verses: [
        { id: "d", reference: "D&C 4", volume: "dnc", book: "dc", chapter: 4, volumeTitle: "D&C", matchCount: 1, matchedVerses: [3], verseLabel: "3", snippets: [] },
        { id: "g", reference: "Genesis 1", volume: "oldtestament", book: "genesis", chapter: 1, volumeTitle: "OT", matchCount: 1, matchedVerses: [1], verseLabel: "1", snippets: [] },
      ],
      truncated: true,
    };
    const shown = visibleResults(results, false);
    expect(shown.references.map((item) => item.id)).toEqual(["j"]);
    expect(shown.verses.map((item) => item.id)).toEqual(["g"]);
    // The limit was reached on Latter-day Saint matches, after every Bible match was found.
    expect(shown.truncated).toBe(false);
    expect(visibleResults(results, true)).toBe(results);
  });
});

describe("faith tradition in the app", () => {
  it("is chosen in Settings → Reading and changes the Library and navigation at once", async () => {
    lastPosition.set({ volume: "bookofmormon", book: "alma", chapter: 32, at: "2026-10-27T00:00:00.000Z" });
    await renderRouter("./app", { initialUrl: "/browse" });
    expect(await screen.findByTestId("volume-bookofmormon")).toBeTruthy();
    expect(screen.getByTestId("card-come-follow-me")).toBeTruthy();
    expect(screen.getByTestId("card-continue-reading")).toBeTruthy();
    expect(screen.getByTestId("nav-come-follow-me")).toBeTruthy();

    await act(async () => {
      router.push("/settings?tab=reading");
    });
    await screen.findByTestId("faith-tradition");
    expect(screen.getByTestId("faith-latter-day-saint").props.accessibilityState).toMatchObject({ checked: true });
    await press(screen.getByTestId("faith-other"));
    expect(port.data.get(FAITH_TRADITION_STORAGE_KEY)).toBe("other");
    expect(screen.getByTestId("faith-other").props.accessibilityState).toMatchObject({ checked: true });

    await press(screen.getByLabelText("Close settings"));
    await waitFor(() => expect(screen).toHavePathname("/browse"));
    expect(screen.queryByTestId("volume-bookofmormon")).toBeNull();
    expect(screen.queryByTestId("volume-doctrineandcovenants")).toBeNull();
    expect(screen.queryByTestId("volume-pearl")).toBeNull();
    expect(screen.getByTestId("volume-oldtestament")).toBeTruthy();
    expect(screen.getByTestId("volume-newtestament")).toBeTruthy();
    expect(screen.queryByTestId("card-come-follow-me")).toBeNull();
    // The saved position is in the Book of Mormon, so Continue reading isn't offered.
    expect(screen.queryByTestId("card-continue-reading")).toBeNull();
    expect(screen.queryByTestId("nav-come-follow-me")).toBeNull();
    expect(screen.getByTestId("nav-notes")).toBeTruthy();
  });

  it("shows the web's notice on direct routes to Latter-day Saint content, with a way to the setting", async () => {
    faithTradition.set("other");
    await renderRouter("./app", { initialUrl: "/browse/bookofmormon" });
    expect(await screen.findByText("Content hidden by your faith tradition")).toBeTruthy();
    expect(screen.queryByTestId("book-alma")).toBeNull();

    await act(async () => {
      router.push("/browse/dnc/dc");
    });
    expect(await screen.findByText("Content hidden by your faith tradition")).toBeTruthy();
    expect(screen.queryByTestId("chapter-1")).toBeNull();

    await act(async () => {
      router.navigate("/come-follow-me");
    });
    await waitFor(() => expect(screen).toHavePathname("/come-follow-me"));
    expect(screen.getAllByText("Content hidden by your faith tradition").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("featured-lesson")).toBeNull();

    await press(screen.getAllByLabelText("Settings").at(-1)!);
    await waitFor(() => expect(screen).toHavePathname("/settings"));
    expect(screen.getByTestId("settings-tab-reading").props.accessibilityState).toMatchObject({ selected: true });
  });

  it("keeps Bible volumes open for Other denominations", async () => {
    faithTradition.set("other");
    await renderRouter("./app", { initialUrl: "/browse/oldtestament" });
    expect(await screen.findByTestId("book-genesis")).toBeTruthy();
    expect(screen.queryByText("Content hidden by your faith tradition")).toBeNull();
  });

  it("offers only the Bible's volumes in search", async () => {
    faithTradition.set("other");
    await renderRouter("./app", { initialUrl: "/search" });
    await screen.findByTestId("search-input");
    expect(screen.queryByText("Book of Mormon")).toBeNull();
    expect(screen.getByText("Old Testament")).toBeTruthy();
    expect(screen.getByText("Search the Bible on this device: go to a reference, or find verses by their words.")).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("search-input"), "Alma 32");
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(screen.queryByLabelText(/^Alma 32,/)).toBeNull();
  });
});
