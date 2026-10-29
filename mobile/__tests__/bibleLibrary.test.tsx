// The Bible library through its store and Settings → Translations: the saved Bibles, the default Bible and the
// Joseph Smith Translation choice under the web's names and formats, with the web's rules (ids without case, removing
// the default restores the King James Bible), the HelloAO catalog picker (its list stubbed here: no network), and
// the plain King James label and no JST choice for Other denominations.

import { act, fireEvent, renderRouter, screen, within } from "expo-router/testing-library";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import {
  DEFAULT_BIBLE_KEY,
  JST_PREFERENCE_STORAGE_KEY,
  LDS_BIBLE_ID,
  SAVED_BIBLES_KEY,
  parseSavedBibles,
  readDefaultBible,
  readJstEnabled,
  readSavedBibles,
  removeBible,
  resetBibleLibrary,
  saveBible,
  setDefaultBible,
  setJstEnabled,
} from "../src/storage/bibleLibrary";
import { faithTradition } from "../src/storage/faithTradition";
import { readerPreferences, simpleMode } from "../src/storage/preferences";
import { initDeviceStudy } from "../src/storage/study";

jest.mock("../src/features/explore/translations", () => {
  const actual = jest.requireActual("../src/features/explore/translations");
  return {
    ...actual,
    loadTranslations: jest.fn(async () => [
      { id: "BSB", name: "Berean Standard Bible", englishName: "Berean Standard Bible", shortName: "BSB", language: "eng", languageEnglishName: "English" },
      { id: "eng_net", name: "NET Bible", englishName: "NET Bible", shortName: "NET", language: "eng", languageEnglishName: "English" },
      { id: "eng_kjv", name: "King James (Authorized) Version", englishName: "King James (Authorized) Version", shortName: "KJV", language: "eng", languageEnglishName: "English" },
      { id: "fra_lsg", name: "Louis Segond 1910", englishName: "French Louis Segond", shortName: "LSG", language: "fra", languageName: "Français", languageEnglishName: "French" },
    ]),
  };
});

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
  resetBibleLibrary();
  faithTradition.reset();
  readerPreferences.reset();
  simpleMode.reset();
  initDeviceStudy();
});

describe("Bible library storage", () => {
  it("reads the web's saved list: valid entries, each id once without regard to case", () => {
    expect(parseSavedBibles(null)).toEqual([]);
    expect(parseSavedBibles("not json")).toEqual([]);
    expect(parseSavedBibles(JSON.stringify({ id: "BSB" }))).toEqual([]);
    expect(
      parseSavedBibles(
        JSON.stringify([{ id: " BSB ", label: "Berean Standard Bible", language: "English", abbreviation: "BSB" }, { id: "bsb", label: "Again" }, { id: "" }, { id: "eng_net" }, null]),
      ),
    ).toEqual([
      { id: "BSB", label: "Berean Standard Bible", language: "English", abbreviation: "BSB" },
      { id: "eng_net", label: "eng_net", language: undefined, abbreviation: undefined },
    ]);
  });

  it("saves, defaults and removes Bibles under the web's keys, and removing the default restores the King James Bible", () => {
    expect(readDefaultBible()).toBe(LDS_BIBLE_ID);
    expect(saveBible({ id: "BSB", label: "Berean Standard Bible", language: "English", abbreviation: "BSB" })).toBe(true);
    expect(saveBible({ id: "bsb", label: "Duplicate" })).toBe(true);
    expect(saveBible({ id: "fra_lsg", label: "French Louis Segond", language: "French" })).toBe(true);
    expect(JSON.parse(port.data.get(SAVED_BIBLES_KEY)!).map((item: { id: string }) => item.id)).toEqual(["BSB", "fra_lsg"]);

    expect(setDefaultBible("fra_lsg")).toBe(true);
    expect(port.data.get(DEFAULT_BIBLE_KEY)).toBe("fra_lsg");
    // The web's normalization: built-in ids lower-cased, anything unusable is the bundled Bible.
    setDefaultBible("KJV");
    expect(readDefaultBible()).toBe("kjv");
    setDefaultBible("bad id!");
    expect(readDefaultBible()).toBe(LDS_BIBLE_ID);

    setDefaultBible("fra_lsg");
    expect(removeBible("FRA_LSG")).toBe(true);
    expect(readDefaultBible()).toBe(LDS_BIBLE_ID);
    expect(readSavedBibles().map((item) => item.id)).toEqual(["BSB"]);

    resetBibleLibrary();
    expect(readSavedBibles().map((item) => item.id)).toEqual(["BSB"]);
    expect(readDefaultBible()).toBe(LDS_BIBLE_ID);
  });

  it("keeps the JST choice as the web's 1 or 0, off by default", () => {
    expect(readJstEnabled()).toBe(false);
    expect(setJstEnabled(true)).toBe(true);
    expect(port.data.get(JST_PREFERENCE_STORAGE_KEY)).toBe("1");
    resetBibleLibrary();
    expect(readJstEnabled()).toBe(true);
    setJstEnabled(false);
    expect(port.data.get(JST_PREFERENCE_STORAGE_KEY)).toBe("0");
  });

  it("changes nothing when the device refuses a write", () => {
    saveBible({ id: "BSB", label: "Berean Standard Bible" });
    setDefaultBible("BSB");
    port.setItem = () => {
      throw new Error("disk full");
    };
    expect(saveBible({ id: "eng_net", label: "NET Bible" })).toBe(false);
    expect(removeBible("BSB")).toBe(false);
    expect(setJstEnabled(true)).toBe(false);
    expect(readSavedBibles().map((item) => item.id)).toEqual(["BSB"]);
    expect(readDefaultBible()).toBe("BSB");
    expect(readJstEnabled()).toBe(false);
  });
});

describe("Settings → Translations: Your Bibles", () => {
  it("adds a Bible from the library, makes it the default, and removing it restores the King James Bible", async () => {
    await renderRouter("./app", { initialUrl: "/settings?tab=bible-translations" });
    await screen.findByTestId("settings-tab-account");
    expect(within(screen.getByTestId("bible-row-lds")).getByText("King James Bible (LDS edition)")).toBeTruthy();
    expect(screen.getByLabelText("Use King James Bible (LDS edition) as default").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText("Add a Bible to read it verse by verse beside the base text.")).toBeTruthy();

    await press(screen.getByTestId("add-bible"));
    // The opening list: the featured modern English Bibles.
    expect(await screen.findByText("Featured English Bibles")).toBeTruthy();
    await press(screen.getByLabelText("Add NET Bible"));
    // Back on the list of Bibles, in the editor and on the page.
    expect(screen.getAllByTestId("bible-row-eng_net").length).toBeGreaterThan(0);
    expect(JSON.parse(port.data.get(SAVED_BIBLES_KEY)!)).toEqual([{ id: "eng_net", label: "NET Bible", language: "English", abbreviation: "NET" }]);

    // Searching another language, through the library's own rules, from the editor's own list.
    await press(screen.getAllByTestId("add-bible").at(-1)!);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Search Bibles"), "segond");
    });
    expect(await screen.findByText("No Bibles match “segond” in English.")).toBeTruthy();
    await press(screen.getByText("Search all languages"));
    await press(screen.getByLabelText("Add French Louis Segond"));
    expect(readSavedBibles().map((item) => item.id)).toEqual(["eng_net", "fra_lsg"]);
    await press(screen.getByText("Done"));

    await press(screen.getByLabelText("Use NET Bible as default"));
    expect(port.data.get(DEFAULT_BIBLE_KEY)).toBe("eng_net");
    expect(screen.getByLabelText("Use NET Bible as default").props.accessibilityState).toMatchObject({ selected: true });

    await press(screen.getByLabelText("Remove NET Bible"));
    expect(port.data.get(DEFAULT_BIBLE_KEY)).toBe(LDS_BIBLE_ID);
    expect(screen.queryByTestId("bible-row-eng_net")).toBeNull();
    expect(screen.getByTestId("bible-row-fra_lsg")).toBeTruthy();
  });

  it("says when a searched Bible needs a publisher's license", async () => {
    await renderRouter("./app", { initialUrl: "/settings?tab=bible-translations" });
    await screen.findByTestId("settings-tab-account");
    await press(screen.getByTestId("add-bible"));
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Search Bibles"), "NIV");
    });
    expect(await screen.findByText("NRSVue, NIV, NLT, CSB and ESV need a publisher’s license, so they aren’t available here.")).toBeTruthy();
  });

  it("turns the Joseph Smith Translation on, and leaves it out with the plain King James label for Other denominations", async () => {
    await renderRouter("./app", { initialUrl: "/settings?tab=bible-translations" });
    await screen.findByTestId("settings-tab-account");
    await press(screen.getByText("Joseph Smith Translation"));
    await press(screen.getByTestId("jst-switch"));
    expect(port.data.get(JST_PREFERENCE_STORAGE_KEY)).toBe("1");
    expect(screen.getByTestId("jst-switch").props.accessibilityState).toMatchObject({ checked: true });

    await act(async () => {
      faithTradition.set("other");
    });
    expect(screen.queryByTestId("jst-choice")).toBeNull();
    expect(within(screen.getByTestId("bible-row-lds")).getByText("King James Bible")).toBeTruthy();
    expect(screen.queryByText("King James Bible (LDS edition)")).toBeNull();
  });
});
