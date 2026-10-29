// The reader's own settings sheet (ReaderSettingsSheet.tsx) signed in before the account's reader preferences have
// arrived on this device: its text size, typeface and width say they're loading and change nothing (no write over
// the defaults that could later be sent as the account's), while simple mode, a device setting, still works. Once the
// account's copy has been read (`fromServer`), the same controls change the account's preferences.

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ReaderSettingsSheet from "../src/features/reader/ReaderSettingsSheet";
import { ACCOUNT_SETTINGS_LOADING } from "../src/features/settings/preferencesPlace";
import { accountStore, resetAccountStores } from "../src/storage/accountStudy";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { appearancePending, readAccountPrefs, readerPreferences, simpleMode, writeAccountPrefs } from "../src/storage/preferences";
import { resetStudySession, setStudySession } from "../src/storage/studySession";

let port: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  port = memoryStorage();
  setStoragePort(port);
  resetAccountStores();
  resetStudySession();
  readerPreferences.reset();
  simpleMode.reset();
});

afterEach(() => resetStudySession());

async function sheet() {
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  return await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ReaderSettingsSheet visible onClose={() => {}} />
    </SafeAreaProvider>
  );
}

describe("the reader's settings before the account's preferences arrive", () => {
  it("disables appearance, writes nothing, and keeps simple mode", async () => {
    setStudySession({ mode: "account", owner: "ada", store: accountStore("ada"), sync: null });
    expect(readAccountPrefs("ada").fromServer).toBe(false);
    await sheet();
    expect(screen.getByText(ACCOUNT_SETTINGS_LOADING)).toBeTruthy();
    expect(screen.getByTestId("reader-settings-appearance").props.accessibilityState).toMatchObject({ disabled: true });
    const before = readerPreferences.get();
    const stored = () => JSON.stringify([...port.data.entries()]);
    const written = stored();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Larger text"));
      fireEvent.press(screen.getByLabelText("Smaller text"));
      fireEvent(screen.getByLabelText("Text size"), "accessibilityAction", { nativeEvent: { actionName: "increment" } });
      fireEvent.press(screen.getByText("Sans"));
      fireEvent.press(screen.getByText("Full"));
    });
    // Nothing changed or waits to be sent: the account's own copy will be shown as it is.
    expect(readerPreferences.get()).toEqual(before);
    expect(appearancePending(readAccountPrefs("ada"))).toBe(false);
    expect(stored()).toBe(written);

    // Simple mode stays on this device and isn't gated.
    await act(async () => {
      fireEvent(screen.getByLabelText("Simple mode"), "valueChange", true);
    });
    expect(simpleMode.get()).toBe(true);
  });

  it("changes the account's preferences once its copy has been read", async () => {
    setStudySession({ mode: "account", owner: "ada", store: accountStore("ada"), sync: null });
    await sheet();
    await act(async () => {
      writeAccountPrefs("ada", { ...readAccountPrefs("ada"), prefs: { ...readAccountPrefs("ada").prefs, fontScale: 1.1 }, fromServer: true });
    });
    expect(screen.queryByText(ACCOUNT_SETTINGS_LOADING)).toBeNull();
    expect(screen.getByTestId("reader-settings-appearance").props.accessibilityState).toMatchObject({ disabled: false });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Larger text"));
    });
    expect(readerPreferences.get().fontScale).toBe(1.15);
    expect(appearancePending(readAccountPrefs("ada"))).toBe(true);
  });

  it("is unchanged signed out", async () => {
    await sheet();
    expect(screen.queryByText(ACCOUNT_SETTINGS_LOADING)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText("Sans"));
    });
    expect(readerPreferences.get().fontFamily).toBe("sans");
  });
});
