import { describe, expect, test } from "vitest";
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TABS,
  settingsPanelId,
  settingsTabId,
  tabForKey,
  tabFromHash,
} from "../src/features/settings/settingsTabs";

describe("settings tabs", () => {
  test("the hash opens its tab, and anything else opens Account", () => {
    expect(tabFromHash("#reading")).toBe("reading");
    expect(tabFromHash("#release-notes")).toBe("release-notes");
    expect(tabFromHash("study-tools")).toBe("study-tools");
    expect(tabFromHash("")).toBe(DEFAULT_SETTINGS_TAB);
    expect(tabFromHash("#")).toBe("account");
    expect(tabFromHash("#profile")).toBe("account");
    expect(tabFromHash("#%E0%A4%A")).toBe("account");
  });

  test("Left and Right step along the row and wrap; Up and Down do nothing", () => {
    expect(tabForKey("ArrowRight", "account")).toBe("reading");
    expect(tabForKey("ArrowRight", "study-tools")).toBe("release-notes");
    expect(tabForKey("ArrowRight", "release-notes")).toBe("account");
    expect(tabForKey("ArrowLeft", "reading")).toBe("account");
    expect(tabForKey("ArrowLeft", "account")).toBe("release-notes");
    expect(tabForKey("ArrowDown", "reading")).toBeNull();
    expect(tabForKey("ArrowUp", "reading")).toBeNull();
  });

  test("Home and End go to the ends, other keys do nothing", () => {
    expect(tabForKey("Home", "study-tools")).toBe("account");
    expect(tabForKey("End", "account")).toBe("release-notes");
    expect(tabForKey("Enter", "account")).toBeNull();
    expect(tabForKey("Tab", "reading")).toBeNull();
  });

  test("tab and panel ids never equal a hash, so the browser has nothing to jump to", () => {
    for (const tab of SETTINGS_TABS) {
      expect(settingsTabId(tab)).not.toBe(tab);
      expect(settingsPanelId(tab)).not.toBe(tab);
    }
    expect(settingsPanelId("reading")).toBe("settings-panel-reading");
  });
});
