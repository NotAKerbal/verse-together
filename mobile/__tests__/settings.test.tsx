// Settings through the real router and storage: its sections, reader preferences and quick marks saved under the
// web's keys and read back after the screen and the stores are rebuilt, a failed write that leaves things as they
// were, the comparison translation the selection menu then uses, deleting this device's study, and the about
// section's links.

import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Alert, Linking } from "react-native";
import { DEFAULT_MARK_PRESETS, DEVICE_STUDY_KEY, annotationChapter } from "../src/shared/web";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { PREFS_KEY, SIMPLE_MODE_KEY, readerPreferences, simpleMode } from "../src/storage/preferences";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";
import { selectText } from "../testing/scriptureText";

jest.mock("../src/features/explore/translations", () => {
  const actual = jest.requireActual("../src/features/explore/translations");
  return {
    ...actual,
    loadTranslations: jest.fn(async () => [
      { id: "BSB", name: "Berean Standard Bible", englishName: "Berean Standard Bible", language: "eng", languageEnglishName: "English" },
      { id: "fra_lsg", name: "Louis Segond 1910", englishName: "French Louis Segond", language: "fra", languageEnglishName: "French" },
    ]),
    loadComparison: jest.fn(async (_book: string, _chapter: number, translationId: string) => ({
      translationName: translationId === "fra_lsg" ? "French Louis Segond" : "Berean Standard Bible",
      verses: [{ verse: 1, text: "Au commencement était la Parole." }],
    })),
  };
});

const { loadComparison } = jest.requireMock("../src/features/explore/translations") as { loadComparison: jest.Mock };

// The build's app config (app.json), as a release build embeds it.
jest.mock("expo-constants", () => {
  const actual = jest.requireActual("expo-constants");
  const constants = actual.default ?? actual;
  return { __esModule: true, ...actual, default: { ...constants, expoConfig: jest.requireActual("../app.json").expo } };
});

let port: ReturnType<typeof memoryStorage>;

/** A press inside an async act, then let deferred work run (renderRouter runs under fake timers). */
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
}

async function openSettings(tab?: string) {
  const view = await renderRouter("./app", { initialUrl: tab ? `/settings?tab=${tab}` : "/settings" });
  await screen.findByTestId("settings-tab-account");
  return view;
}

/**
 * Closes Settings, makes the cached stores forget their values (as a restart does), and opens Settings again: a new
 * screen reading only what storage kept.
 */
async function reopen(tab: string) {
  await press(screen.getByLabelText("Close settings"));
  expect(screen.queryByTestId("settings-tab-account")).toBeNull();
  readerPreferences.reset();
  simpleMode.reset();
  await act(async () => {
    router.push(`/settings?tab=${tab}`);
  });
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  await screen.findByTestId("settings-tab-account");
}

const savedPrefs = () => JSON.parse(port.data.get(PREFS_KEY) ?? "null");

beforeEach(() => {
  port = memoryStorage();
  setStoragePort(port);
  readerPreferences.reset();
  simpleMode.reset();
  initDeviceStudy();
});

afterEach(() => jest.restoreAllMocks());

describe("Settings sections", () => {
  it("opens Study tools from the reader's quick marks shortcut", async () => {
    await renderRouter("./app", { initialUrl: "/browse/bookofmormon/alma/32" });
    await press(await screen.findByTestId("reader-settings-button"));
    await press(await screen.findByText("Quick marks and more settings"));
    await waitFor(() => expect(screen).toHavePathname("/settings"));
    expect(screen.getByTestId("settings-tab-study-tools").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText("Quick marks")).toBeTruthy();
  });

  it("opens Account by default, the section a link names, and switches with the tabs", async () => {
    await openSettings();
    expect(screen.getByTestId("settings-tab-account").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText("Your Google sign-in, and the study saved on this device.")).toBeTruthy();
    // Hidden sections stay mounted but aren't announced or found.
    expect(screen.queryByText("Reading & appearance")).toBeNull();

    await press(screen.getByTestId("settings-tab-reading"));
    expect(screen.getByText("Reading & appearance")).toBeTruthy();
    expect(screen.queryByText("Your Google sign-in, and the study saved on this device.")).toBeNull();
    expect(screen.getByTestId("settings-tab-reading").props.accessibilityState).toMatchObject({ selected: true });

    await reopen("study-tools");
    expect(screen.getByText("Quick marks")).toBeTruthy();
    expect(screen.getByTestId("settings-tab-study-tools").props.accessibilityState).toMatchObject({ selected: true });
  });
});

describe("Settings → Reading", () => {
  it("saves text size, typeface, width and simple mode under the web's keys, and they come back after a restart", async () => {
    await openSettings("reading");
    expect(screen.getByTestId("reading-preview-summary")).toHaveTextContent("100% · Serif · Comfortable width");
    expect(screen.getByLabelText("Reset scripture appearance").props.accessibilityState).toMatchObject({ disabled: true });

    await act(async () => {
      fireEvent(screen.getByTestId("settings-text-size"), "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    });
    await press(within(screen.getByLabelText("Typeface")).getByLabelText("Sans"));
    await press(within(screen.getByLabelText("Text width")).getByLabelText("Wide"));
    await press(screen.getByTestId("settings-simple-mode"));

    expect(screen.getByTestId("reading-preview-summary")).toHaveTextContent("105% · Sans · Wide width");
    expect(screen.getByText("A wider column on large screens.")).toBeTruthy();
    expect(screen.getByText("Study tools hidden · This device")).toBeTruthy();
    expect(savedPrefs()).toMatchObject({ fontScale: 1.05, fontFamily: "sans", textWidth: "wide" });
    expect(port.data.get(SIMPLE_MODE_KEY)).toBe("true");

    await reopen("reading");
    expect(screen.getByTestId("reading-preview-summary")).toHaveTextContent("105% · Sans · Wide width");
    expect(screen.getByTestId("settings-simple-mode").props.accessibilityState).toMatchObject({ checked: true });
    expect(within(screen.getByLabelText("Typeface")).getByLabelText("Sans").props.accessibilityState).toMatchObject({ checked: true });
  });

  it("Reset puts back the default appearance and keeps the quick marks", async () => {
    const presets = [{ kind: "underline", color: "blue", name: "Promises" }];
    port.setItem(PREFS_KEY, JSON.stringify({ fontScale: 1.2, fontFamily: "sans", textWidth: "full", markPresets: presets }));
    await openSettings("reading");
    expect(screen.getByTestId("reading-preview-summary")).toHaveTextContent("120% · Sans · Full width");
    await press(screen.getByLabelText("Reset scripture appearance"));
    expect(screen.getByTestId("reading-preview-summary")).toHaveTextContent("100% · Serif · Comfortable width");
    expect(savedPrefs()).toEqual({ fontScale: 1, fontFamily: "serif", textWidth: "comfortable", markPresets: presets });
  });

  it("says so when the device refuses a reading setting, and keeps the one it had", async () => {
    await openSettings("reading");
    const setItem = port.setItem;
    port.setItem = (key, value) => {
      if (key === PREFS_KEY || key === SIMPLE_MODE_KEY) throw new Error("disk full");
      setItem(key, value);
    };
    await press(within(screen.getByLabelText("Typeface")).getByLabelText("Sans"));
    expect(screen.getByText("Couldn't save this on the device. Try again.")).toBeTruthy();
    expect(screen.getByTestId("reading-preview-summary")).toHaveTextContent("100% · Serif · Comfortable width");
    await press(screen.getByTestId("settings-simple-mode"));
    expect(screen.getByTestId("settings-simple-mode").props.accessibilityState).toMatchObject({ checked: false });
  });
});

describe("Settings → Study tools", () => {
  it("names, reorders, restyles, removes and adds quick marks, and the list survives a restart", async () => {
    await openSettings("study-tools");
    expect(screen.getByText(`6 of 12 · This device`)).toBeTruthy();
    expect(screen.getByTestId("quick-marks-restore").props.accessibilityState).toMatchObject({ disabled: true });

    const name = screen.getByLabelText("Quick mark 1 name");
    await act(async () => {
      fireEvent(name, "focus");
    });
    await act(async () => {
      fireEvent.changeText(name, "  Blessings  ");
    });
    expect(screen.getByText("13/40")).toBeTruthy();
    await act(async () => {
      fireEvent(name, "endEditing", { nativeEvent: { text: "  Blessings  " } });
    });
    expect(savedPrefs().markPresets[0]).toEqual({ kind: "highlight", color: "yellow", name: "Blessings" });

    await press(screen.getByLabelText("Move Blessings (yellow highlight) down"));
    expect(savedPrefs().markPresets.slice(0, 2)).toEqual([
      { kind: "highlight", color: "blue" },
      { kind: "highlight", color: "yellow", name: "Blessings" },
    ]);

    // A style another quick mark already has is refused, and nothing changes.
    await press(within(screen.getByTestId("quick-mark-1")).getByTestId("mark-color-blue"));
    expect(screen.getByText("Blue highlight is already quick mark 1.")).toBeTruthy();
    expect(savedPrefs().markPresets[1]).toEqual({ kind: "highlight", color: "yellow", name: "Blessings" });

    await press(within(screen.getByTestId("quick-mark-1")).getByTestId("mark-kind-underline"));
    expect(savedPrefs().markPresets[1]).toEqual({ kind: "underline", color: "yellow", name: "Blessings" });

    await press(screen.getByLabelText("Remove blue highlight"));
    await press(screen.getByTestId("quick-mark-add"));
    const saved = savedPrefs().markPresets;
    expect(saved).toHaveLength(6);
    expect(saved[0]).toEqual({ kind: "underline", color: "yellow", name: "Blessings" });
    expect(saved[5]).toEqual({ kind: "highlight", color: "red" });

    await reopen("study-tools");
    expect(screen.getByText("Blessings")).toBeTruthy();
    expect(screen.getByLabelText("Move Blessings (yellow underline) up").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByLabelText("Remove red highlight")).toBeTruthy();

    await press(screen.getByTestId("quick-marks-restore"));
    expect(savedPrefs().markPresets).toEqual(DEFAULT_MARK_PRESETS);
  });

  it("says so when the device refuses the write, and keeps the list it had", async () => {
    await openSettings("study-tools");
    const setItem = port.setItem;
    port.setItem = (key, value) => {
      if (key === PREFS_KEY) throw new Error("disk full");
      setItem(key, value);
    };
    await press(screen.getByLabelText("Remove yellow highlight"));
    expect(screen.getByText("Couldn't save your quick marks on this device. Try again.")).toBeTruthy();
    expect(screen.getByText("6 of 12 · This device")).toBeTruthy();
    expect(screen.getByLabelText("Remove yellow highlight")).toBeTruthy();
  });
});

describe("Settings → Translations", () => {
  it("chooses the comparison translation the selection menu then uses, and forgets it", async () => {
    await renderRouter("./app", { initialUrl: "/browse/newtestament/john/1" });
    await screen.findByTestId("reader-text");
    await act(async () => {
      router.push("/settings?tab=bible-translations");
    });
    await screen.findByTestId("settings-tab-account");
    expect(screen.getByText("King James Bible (LDS edition)")).toBeTruthy();
    expect(screen.getByText("No comparison translation")).toBeTruthy();

    await press(screen.getByTestId("choose-compare-translation"));
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Find a translation"), "french");
    });
    await press(await screen.findByLabelText("Compare with French Louis Segond"));
    expect(port.data.get("vt_compare_translation_v1")).toBe(JSON.stringify("fra_lsg"));
    expect(within(screen.getByTestId("compare-translation")).getByText("French Louis Segond")).toBeTruthy();

    // Back in John 1, the selection menu's Translations opens straight to that translation.
    await press(screen.getByLabelText("Close settings"));
    await waitFor(() => expect(screen).toHavePathname("/browse/newtestament/john/1"));
    await selectText("In the beginning was the Word");
    await press(await screen.findByTestId("action-translations"));
    expect(await screen.findByText(/^fra_lsg\s+Au commencement était la Parole\.$/)).toBeTruthy();
    expect(loadComparison).toHaveBeenLastCalledWith("john", 1, "fra_lsg");
  });

  it("forgets the comparison translation", async () => {
    port.setItem("vt_compare_translation_v1", JSON.stringify("fra_lsg"));
    await openSettings("bible-translations");
    await waitFor(() => expect(within(screen.getByTestId("compare-translation")).getByText("French Louis Segond")).toBeTruthy());
    await press(screen.getByLabelText("Stop comparing with French Louis Segond"));
    expect(port.data.has("vt_compare_translation_v1")).toBe(false);
    expect(screen.getByText("No comparison translation")).toBeTruthy();
  });
});

describe("Settings → Account and About", () => {
  it("keeps the account (in a build without sign-in) and deletes this device's study", async () => {
    deviceStudy.createNote({ requestId: "note-1", markdownBody: "Faith", journalDate: "2026-10-27" });
    deviceStudy.setVerseMarks(annotationChapter("bookofmormon", "alma", 32), [21], { highlightColor: "yellow" });
    await openSettings();
    expect(screen.getByText(/Signing in isn’t set up in this build/)).toBeTruthy();
    expect(screen.getByText("1 journal entry · 1 verse annotation")).toBeTruthy();

    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === "destructive")?.onPress?.();
    });
    await press(screen.getByLabelText("Delete all study on this device"));
    expect(JSON.parse(port.data.get(DEVICE_STUDY_KEY)!)).toMatchObject({ notes: [], annotations: [] });
    expect(screen.getByText("0 journal entries · 0 verse annotations")).toBeTruthy();
  });

  it("links to the privacy policy, account deletion and support, with the app's real version", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await openSettings("about");
    const { expo } = jest.requireActual("../app.json");
    expect(screen.getByText(new RegExp(`^Version ${expo.version.replace(/\./g, "\\.")} \\((${expo.ios.buildNumber}|${expo.android.versionCode})\\)$`))).toBeTruthy();

    await press(screen.getByLabelText("Privacy policy"));
    expect(open).toHaveBeenLastCalledWith("https://www.versetogether.org/privacy");
    await press(screen.getByLabelText("Delete account on the web"));
    expect(open).toHaveBeenLastCalledWith("https://www.versetogether.org/delete-account");
    await press(screen.getByLabelText("Email Verse Together"));
    expect(open.mock.lastCall?.[0]).toMatch(/^mailto:isaachcochran@gmail\.com\?subject=Verse%20Together%20app/);

    // The privacy link under every section.
    await press(screen.getByTestId("settings-privacy-link"));
    expect(open).toHaveBeenLastCalledWith("https://www.versetogether.org/privacy");

    await press(screen.getByLabelText("Go to Account"));
    expect(screen.getByTestId("settings-tab-account").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText(/Signing in isn’t set up in this build/)).toBeTruthy();
  });
});
