// Settings parity with the web, below the screens: whose reader preferences show and where a change is saved (this
// device's, an account's, or nobody's while the account is checked), the account sync through the website's own
// preferences functions (a stand-in Convex client here: no backend is called), Feedback's form rules and how it is
// sent (a stand-in route: nothing is submitted), the website's release notes labeled as the website's, and the
// Settings sections.

import { getFunctionName } from "convex/server";
import { render } from "@testing-library/react-native";
import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { CURRENT_VERSION, RELEASES, UNRELEASED } from "@/lib/releaseNotes";
import type { SyncClient } from "../src/account/studySync";
import FeedbackSettings from "../src/features/settings/FeedbackSettings";
import { FEEDBACK_PATH, feedbackRoute, sendFeedback, type FeedbackRoute } from "../src/features/settings/feedback";
import { PreferencesSync, applyServerPreferences, startPreferencesSync } from "../src/features/settings/preferencesSync";
import { RELEASE_NOTE_IMAGES } from "../src/features/settings/releaseNoteImages";
import { SETTINGS_TABS } from "../src/features/settings/settingsTabs";
import { DEFAULT_MARK_PRESETS } from "../src/shared/web";
import { accountStore, resetAccountStores } from "../src/storage/accountStudy";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import {
  ACCOUNT_PREFS_PREFIX,
  PREFS_KEY,
  appearancePending,
  defaultPreferences,
  normalizePreferences,
  preferencesOwner,
  presetsPending,
  purgeAccountPrefs,
  readAccountPrefs,
  readerPreferences,
  readerPreferencesReady,
  simpleMode,
} from "../src/storage/preferences";
import QuickMarkSettings from "../src/features/settings/QuickMarkSettings";
import ReadingSettings from "../src/features/settings/ReadingSettings";
import { resetStudySession, setStudySession } from "../src/storage/studySession";
import { initDeviceStudy } from "../src/storage/study";

jest.mock("expo-constants", () => {
  const actual = jest.requireActual("expo-constants");
  const constants = actual.default ?? actual;
  return { __esModule: true, ...actual, default: { ...constants, expoConfig: jest.requireActual("../app.json").expo } };
});

let port: ReturnType<typeof memoryStorage>;

function signIn(owner: string) {
  setStudySession({ mode: "account", owner, store: accountStore(owner), sync: null });
}

/** Signed in, with the account's own preferences already read on this device (null: it has none saved yet). */
function signInLoaded(owner: string, server: unknown = null) {
  applyServerPreferences(owner, server);
  signIn(owner);
}

beforeEach(() => {
  port = memoryStorage();
  setStoragePort(port);
  resetAccountStores();
  resetStudySession();
  readerPreferences.reset();
  simpleMode.reset();
  initDeviceStudy();
});

afterEach(() => resetStudySession());

describe("whose reader preferences", () => {
  it("keeps this device's preferences apart from every account's, both ways", () => {
    readerPreferences.set({ ...readerPreferences.get(), fontScale: 1.2, fontFamily: "sans", markPresets: [] });
    expect(preferencesOwner()).toEqual({ kind: "device" });

    // Signing in shows the account's (here it has none saved: the defaults), never this device's.
    signInLoaded("ada");
    expect(readerPreferences.get()).toEqual(defaultPreferences());
    readerPreferences.set({ ...readerPreferences.get(), textWidth: "wide", comparisonView: "sideBySide" });
    expect(JSON.parse(port.getItem(ACCOUNT_PREFS_PREFIX + "ada")!).prefs).toMatchObject({ textWidth: "wide", comparisonView: "sideBySide" });

    // This device's own record is untouched by the account's change.
    expect(JSON.parse(port.getItem(PREFS_KEY)!)).toMatchObject({ fontScale: 1.2, fontFamily: "sans", markPresets: [] });
    expect(JSON.parse(port.getItem(PREFS_KEY)!).textWidth).toBe("comfortable");

    // Another account on this device sees neither.
    signIn("grace");
    expect(readerPreferences.get()).toEqual(defaultPreferences());

    // Signing out shows exactly what this device had.
    resetStudySession();
    expect(readerPreferences.get()).toMatchObject({ fontScale: 1.2, fontFamily: "sans", textWidth: "comfortable", markPresets: [] });
    signIn("ada");
    expect(readerPreferences.get()).toMatchObject({ textWidth: "wide", comparisonView: "sideBySide" });
  });

  it("while the account is checked, shows this device's and saves changes nowhere", () => {
    readerPreferences.set({ ...readerPreferences.get(), fontScale: 1.1 });
    setStudySession({ mode: "blocked", reason: "checking" });
    expect(preferencesOwner()).toEqual({ kind: "pending" });
    expect(readerPreferences.get().fontScale).toBe(1.1);
    readerPreferences.set({ ...readerPreferences.get(), fontScale: 1.3 });
    expect(readerPreferences.get().fontScale).toBe(1.3);
    expect(JSON.parse(port.getItem(PREFS_KEY)!).fontScale).toBe(1.1);
    expect([...port.data.keys()].some((key) => key.startsWith(ACCOUNT_PREFS_PREFIX))).toBe(false);
    // Known now: the account's, and the unsaved change is gone.
    signIn("ada");
    expect(readerPreferences.get().fontScale).toBe(1);
  });

  it("reads the web's footnote and comparison fields, and writes them on this device only once changed", () => {
    expect(normalizePreferences({ showFootnotes: false, comparisonView: "sideBySide" })).toMatchObject({ showFootnotes: false, comparisonView: "sideBySide" });
    expect(normalizePreferences({ comparisonView: "columns" }).comparisonView).toBe("inline");
    readerPreferences.set({ ...readerPreferences.get(), fontScale: 1.05 });
    expect(JSON.parse(port.getItem(PREFS_KEY)!)).not.toHaveProperty("comparisonView");
    readerPreferences.set({ ...readerPreferences.get(), comparisonView: "sideBySide", showFootnotes: false });
    expect(JSON.parse(port.getItem(PREFS_KEY)!)).toMatchObject({ comparisonView: "sideBySide", showFootnotes: false });
    readerPreferences.reset();
    expect(readerPreferences.get()).toMatchObject({ comparisonView: "sideBySide", showFootnotes: false, fontScale: 1.05 });
  });

  it("purges an account's copy on sign-out, keeping one with changes the account hasn't received when asked", () => {
    signInLoaded("ada");
    readerPreferences.set({ ...readerPreferences.get(), fontScale: 1.2 });
    purgeAccountPrefs("ada", { keepPending: true });
    expect(port.getItem(ACCOUNT_PREFS_PREFIX + "ada")).not.toBeNull();
    purgeAccountPrefs("ada");
    expect(port.getItem(ACCOUNT_PREFS_PREFIX + "ada")).toBeNull();
  });
});

type Call = { name: string; args: Record<string, unknown>; resolve: (value: unknown) => void; reject: (error: unknown) => void };

/** A stand-in for the session's Convex client: records each call, answers when told. */
function fakeClient() {
  let connected = true;
  let deliver: ((value: unknown) => void) | null = null;
  const connection = new Set<() => void>();
  const calls: Call[] = [];
  const client: SyncClient = {
    watch(_ref, _args, onValue) {
      deliver = onValue;
      return () => {
        deliver = null;
      };
    },
    query: async () => null,
    mutation: (ref, args) => new Promise((resolve, reject) => calls.push({ name: getFunctionName(ref as never), args, resolve, reject })),
    connected: () => connected,
    onConnectionChange(listener) {
      connection.add(listener);
      return () => {
        connection.delete(listener);
      };
    },
  };
  return {
    client,
    calls,
    serverSends: (value: unknown) => deliver?.(value),
    setConnected(next: boolean) {
      connected = next;
      connection.forEach((listener) => listener());
    },
  };
}

const flush = async () => {
  for (let index = 0; index < 5; index++) await Promise.resolve();
};

describe("account preferences sync", () => {
  beforeEach(() => jest.useRealTimers());

  it("fills in the account's copy, and never replaces a change waiting to be sent with an older one", async () => {
    const fake = fakeClient();
    signIn("ada");
    const sync = new PreferencesSync("ada", fake.client).start();
    fake.serverSends({ showFootnotes: true, fontScale: 1.15, fontFamily: "sans", comparisonView: "inline", textWidth: "full", markPresets: [{ kind: "underline", color: "blue" }] });
    expect(readerPreferences.get()).toMatchObject({ fontScale: 1.15, fontFamily: "sans", textWidth: "full", markPresets: [{ kind: "underline", color: "blue" }] });
    expect(readAccountPrefs("ada").fromServer).toBe(true);

    // A change here, then a late copy of the account's older value: the change stays and is sent.
    readerPreferences.set({ ...readerPreferences.get(), fontScale: 0.9 });
    fake.serverSends({ showFootnotes: true, fontScale: 1.15, fontFamily: "serif", comparisonView: "inline", textWidth: "full", markPresets: [{ kind: "underline", color: "blue" }] });
    expect(readerPreferences.get()).toMatchObject({ fontScale: 0.9, fontFamily: "sans" });
    await flush();
    expect(fake.calls.map((call) => call.name)).toEqual(["preferences:saveReaderPreferences"]);
    expect(fake.calls[0].args).toEqual({ fontScale: 0.9, fontFamily: "sans", textWidth: "full", showFootnotes: true, comparisonView: "inline" });

    fake.calls[0].resolve({ ok: true });
    await flush();
    expect(appearancePending(readAccountPrefs("ada"))).toBe(false);
    // Confirmed: the account's next copy is taken as it is.
    fake.serverSends({ showFootnotes: false, fontScale: 0.9, fontFamily: "sans", comparisonView: "sideBySide", textWidth: "full", markPresets: [] });
    expect(readerPreferences.get()).toMatchObject({ showFootnotes: false, comparisonView: "sideBySide", markPresets: [] });
    sync.dispose();
  });

  it("sends quick marks with saveMarkPresets and the account's own appearance, never this device's", async () => {
    readerPreferences.set({ ...readerPreferences.get(), fontScale: 1.3, fontFamily: "sans" });
    const fake = fakeClient();
    signIn("ada");
    const stop = startPreferencesSync("ada", fake.client);
    fake.serverSends(null);
    readerPreferences.set({ ...readerPreferences.get(), markPresets: [{ kind: "highlight", color: "green", name: "Promises" }] });
    await flush();
    expect(fake.calls.map((call) => call.name)).toEqual(["preferences:saveMarkPresets"]);
    expect(fake.calls[0].args).toEqual({
      presets: [{ kind: "highlight", color: "green", name: "Promises" }],
      readerDefaults: { fontScale: 1, fontFamily: "serif", textWidth: "comfortable", showFootnotes: true, comparisonView: "inline" },
    });
    fake.calls[0].resolve({ markPresets: [{ kind: "highlight", color: "green", name: "Promises" }] });
    await flush();
    expect(presetsPending(readAccountPrefs("ada"))).toBe(false);
    stop();
  });

  it("waits offline, sends after reconnecting, and tries again after a failure", async () => {
    const fake = fakeClient();
    fake.setConnected(false);
    // The account's copy was read in an earlier session; this one starts offline.
    signInLoaded("ada", { showFootnotes: true, fontScale: 1.1, fontFamily: "sans", comparisonView: "inline", textWidth: "comfortable" });
    const sync = new PreferencesSync("ada", fake.client).start();
    readerPreferences.set({ ...readerPreferences.get(), textWidth: "wide" });
    await flush();
    expect(fake.calls).toHaveLength(0);
    expect(sync.getState()).toBe("waiting");

    fake.setConnected(true);
    await flush();
    expect(fake.calls).toHaveLength(1);
    jest.useFakeTimers();
    fake.calls[0].reject(new Error("Server error"));
    await flush();
    expect(sync.getState()).toBe("error");
    expect(appearancePending(readAccountPrefs("ada"))).toBe(true);
    // Tried again after the delay, with the same values.
    jest.advanceTimersByTime(2_000);
    await flush();
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1].args).toEqual({ fontScale: 1.1, fontFamily: "sans", textWidth: "wide", showFootnotes: true, comparisonView: "inline" });
    sync.dispose();
    jest.useRealTimers();
  });

  it("changes nothing for a reply that arrives after the session ended", async () => {
    const fake = fakeClient();
    signIn("ada");
    const sync = new PreferencesSync("ada", fake.client).start();
    fake.serverSends(null);
    readerPreferences.set({ ...readerPreferences.get(), fontScale: 1.2 });
    await flush();
    sync.dispose();
    fake.calls[0].resolve({ ok: true });
    await flush();
    expect(appearancePending(readAccountPrefs("ada"))).toBe(true);
    // A copy delivered after disposal is ignored too.
    fake.serverSends({ showFootnotes: true, fontScale: 0.85, fontFamily: "serif", comparisonView: "inline", textWidth: "comfortable" });
    expect(readerPreferences.get().fontScale).toBe(1.2);
  });

  const CUSTOM = {
    showFootnotes: false,
    fontScale: 1.2,
    fontFamily: "sans",
    comparisonView: "sideBySide",
    textWidth: "full",
    markPresets: [
      { kind: "underline", color: "blue", name: "Covenants" },
      { kind: "highlight", color: "green" },
    ],
  };

  it("changes and sends nothing before the account's copy is read, so its own choices are never replaced by defaults", async () => {
    const fake = fakeClient();
    signIn("ada");
    const sync = new PreferencesSync("ada", fake.client).start();
    expect(readerPreferencesReady()).toBe(false);
    // Edits made while the account's copy is still on its way: refused, nothing marked waiting, nothing sent.
    expect(readerPreferences.set({ ...readerPreferences.get(), fontScale: 0.9 })).toBe(false);
    expect(readerPreferences.set({ ...readerPreferences.get(), markPresets: [{ kind: "highlight", color: "yellow" }] })).toBe(false);
    await flush();
    expect(fake.calls).toEqual([]);
    expect(appearancePending(readAccountPrefs("ada")) || presetsPending(readAccountPrefs("ada"))).toBe(false);

    // The account's own copy arrives and shows as it is, still without anything sent.
    fake.serverSends(CUSTOM);
    await flush();
    expect(readerPreferencesReady()).toBe(true);
    expect(readerPreferences.get()).toMatchObject(CUSTOM);
    expect(fake.calls).toEqual([]);

    // An edit now changes just what was edited; the account's other choices go with it unchanged.
    expect(readerPreferences.set({ ...readerPreferences.get(), fontScale: 1.25 })).toBe(true);
    await flush();
    expect(fake.calls[0]).toMatchObject({
      name: "preferences:saveReaderPreferences",
      args: { fontScale: 1.25, fontFamily: "sans", textWidth: "full", showFootnotes: false, comparisonView: "sideBySide" },
    });
    fake.calls[0].resolve({ ok: true });
    await flush();
    expect(readerPreferences.set({ ...readerPreferences.get(), markPresets: [...CUSTOM.markPresets, { kind: "highlight", color: "pink" }] as never })).toBe(true);
    await flush();
    expect(fake.calls[1]).toMatchObject({ name: "preferences:saveMarkPresets", args: { presets: [...CUSTOM.markPresets, { kind: "highlight", color: "pink" }] } });
    sync.dispose();
  });

  it("holds a change an earlier version saved over the defaults until the account's copy is read, then keeps only what it changed", async () => {
    // Left by an earlier version: a text-size change made before the account's copy had arrived, over the defaults.
    port.setItem(
      ACCOUNT_PREFS_PREFIX + "ada",
      JSON.stringify({ prefs: { ...defaultPreferences(), fontScale: 0.9 }, appearanceRev: 1, confirmedAppearanceRev: 0, presetsRev: 1, confirmedPresetsRev: 0, fromServer: false }),
    );
    const fake = fakeClient();
    signIn("ada");
    const sync = new PreferencesSync("ada", fake.client).start();
    await flush();
    expect(fake.calls).toEqual([]);
    expect(sync.getState()).toBe("waiting");

    fake.serverSends(CUSTOM);
    await flush();
    // The text size the person chose goes, with the account's own typeface, width, footnotes and comparison view.
    expect(fake.calls.map((call) => call.name)).toEqual(["preferences:saveReaderPreferences"]);
    expect(fake.calls[0].args).toEqual({ fontScale: 0.9, fontFamily: "sans", textWidth: "full", showFootnotes: false, comparisonView: "sideBySide" });
    fake.calls[0].resolve({ ok: true });
    await flush();
    // The quick marks were still the defaults: nothing to send, and the account's own list shows.
    expect(fake.calls).toHaveLength(1);
    expect(readerPreferences.get().markPresets).toEqual(CUSTOM.markPresets);
    expect(presetsPending(readAccountPrefs("ada"))).toBe(false);
    sync.dispose();
  });

  it("starts an account with no saved preferences from the defaults", () => {
    readerPreferences.set({ ...readerPreferences.get(), fontScale: 1.25 });
    applyServerPreferences("ada", null);
    signIn("ada");
    expect(readerPreferences.get()).toEqual(defaultPreferences());
    expect(readerPreferences.get().markPresets).toEqual(DEFAULT_MARK_PRESETS);
  });
});

describe("account settings before the account's copy arrives", () => {
  it("Reading says it's loading, and its appearance can't be changed", async () => {
    signIn("ada");
    const reading = await render(<ReadingSettings />);
    expect(reading.getByText(/Loading your account’s settings…/)).toBeTruthy();
    expect(reading.getByTestId("settings-text-size").props.accessibilityState).toMatchObject({ disabled: true });
    expect(reading.getByLabelText("Sans").props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      fireEvent.press(reading.getByLabelText("Sans"));
    });
    expect(readAccountPrefs("ada")).toMatchObject({ appearanceRev: 0, prefs: { fontFamily: "serif" } });
    // Simple mode is this device's own: it stays offered.
    expect(reading.getByTestId("settings-simple-mode")).toBeTruthy();
  });

  it("Quick marks says it's loading and shows no list to edit, then the account's own list once it arrives", async () => {
    signIn("ada");
    const marks = await render(<QuickMarkSettings />);
    expect(marks.getByTestId("quick-marks-loading")).toHaveTextContent(/Loading your account’s settings…/);
    expect(marks.queryByTestId("quick-mark-0")).toBeNull();
    expect(marks.queryByTestId("quick-mark-add")).toBeNull();
    expect(marks.getByTestId("quick-marks-restore").props.accessibilityState).toMatchObject({ disabled: true });

    await act(async () => {
      applyServerPreferences("ada", { showFootnotes: true, fontScale: 1, fontFamily: "serif", comparisonView: "inline", markPresets: [{ kind: "underline", color: "blue" }] });
    });
    expect(marks.queryByTestId("quick-marks-loading")).toBeNull();
    expect(marks.getByTestId("quick-mark-0")).toBeTruthy();
    expect(marks.queryByTestId("quick-mark-1")).toBeNull();
  });
});

describe("Feedback", () => {
  const config = { siteOrigin: "https://example.test", authBaseURL: "https://example.test/api/auth", convexUrl: "https://example.convex.cloud" };

  it("goes anonymously to this build's deployment, through the account when signed in and connected, and nowhere without configuration", async () => {
    expect(feedbackRoute(null).kind).toBe("unavailable");
    expect(feedbackRoute(config)).toMatchObject({ kind: "anonymous", signedIn: false });
    setStudySession({ mode: "account", owner: "ada", store: accountStore("ada"), sync: null });
    // Signed in but not connected: it can't be linked, and says so.
    expect(feedbackRoute(config)).toMatchObject({ kind: "anonymous", signedIn: true });

    const fake = fakeClient();
    const stop = startPreferencesSync("ada", fake.client);
    const syncPort = { connected: () => true } as never;
    setStudySession({ mode: "account", owner: "ada", store: accountStore("ada"), sync: syncPort });
    const route = feedbackRoute(config);
    expect(route.kind).toBe("account");
    const sent = sendFeedback({ message: "  Please add Hebrew.  ", contact: " me@example.test " }, route);
    await flush();
    const call = fake.calls.find((item) => item.name === "feedback:submitFeedback")!;
    expect(call.args).toEqual({ message: "Please add Hebrew.", contact: "me@example.test", path: FEEDBACK_PATH });
    call.resolve({ ok: true });
    await sent;
    stop();
  });

  it("checks the message before sending, keeps it when sending fails, and clears it once sent", async () => {
    const send = jest.fn<Promise<unknown>, [unknown]>();
    const route: FeedbackRoute = { kind: "anonymous", signedIn: false, send };
    const view = await render(<FeedbackSettings route={route} />);
    expect(view.getByText("Sent anonymously. You don't need to sign in.")).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(view.getByTestId("feedback-message"), "Hi");
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("feedback-send"));
    });
    expect(view.getByText("Write at least 5 characters.")).toBeTruthy();
    expect(send).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.changeText(view.getByTestId("feedback-message"), "The reader is lovely.");
    });
    send.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      fireEvent.press(view.getByTestId("feedback-send"));
    });
    expect(view.getByText("Your feedback couldn’t be sent. It’s still here, so you can try again.")).toBeTruthy();
    expect(view.getByTestId("feedback-message").props.value).toBe("The reader is lovely.");

    send.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.press(view.getByTestId("feedback-send"));
    });
    expect(send).toHaveBeenLastCalledWith({ message: "The reader is lovely.", path: FEEDBACK_PATH });
    expect(view.getByText("Thanks! Your feedback was sent.")).toBeTruthy();
    expect(view.getByTestId("feedback-message").props.value).toBe("");
  });

  it("says when a build can't send feedback, and offers email", async () => {
    const view = await render(<FeedbackSettings route={{ kind: "unavailable" }} />);
    expect(view.getByText("Sending feedback isn't set up in this build. You can email it instead.")).toBeTruthy();
    expect(view.getByTestId("feedback-send").props.accessibilityState).toMatchObject({ disabled: true });
    expect(view.getByLabelText("Email feedback")).toBeTruthy();
  });
});

describe("Website release notes and the Settings sections", () => {
  it("has a bundled image for every screenshot in the website's release notes", () => {
    const shots = [...UNRELEASED.items, ...RELEASES.flatMap((release) => release.items)].flatMap((item) => (item.screenshot ? [item.screenshot.src] : []));
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.filter((src) => !(src in RELEASE_NOTE_IMAGES))).toEqual([]);
  });

  it("offers the web's sections, Feedback included, with About in place of Release notes", () => {
    expect(SETTINGS_TABS).toEqual(["account", "reading", "bible-translations", "study-tools", "feedback", "about"]);
  });

  it("labels the release notes as the website's, beside this app's own version", async () => {
    await renderRouter("./app", { initialUrl: "/settings?tab=about" });
    await screen.findByTestId("settings-tab-account");
    const { expo } = jest.requireActual("../app.json");
    expect(screen.getByText("Website release notes")).toBeTruthy();
    expect(screen.getByText(new RegExp(`^versetogether\\.org · Version ${CURRENT_VERSION.replace(/\./g, "\\.")}, released `))).toBeTruthy();
    expect(screen.getByText(new RegExp(`you’re using the app version ${expo.version.replace(/\./g, "\\.")}`))).toBeTruthy();
    expect(screen.getByText(new RegExp(`^Website ${RELEASES[0].version.replace(/\./g, "\\.")} · `))).toBeTruthy();
    // Older releases wait behind "Earlier website releases".
    const oldest = RELEASES[RELEASES.length - 1];
    expect(screen.queryByTestId(`website-release-${oldest.version}`)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId("website-release-earlier"));
    });
    expect(screen.getByTestId(`website-release-${oldest.version}`)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Go to Feedback"));
    });
    expect(screen.getByTestId("settings-tab-feedback").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId("feedback-card")).toBeTruthy();
  });
});
