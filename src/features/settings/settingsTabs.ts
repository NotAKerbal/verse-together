import { useCallback, useSyncExternalStore } from "react";
import { readSimpleModeFromDom } from "@/lib/simpleMode";

/*
  The Settings sections: a pill of tabs, one section open at a time. Wide screens show the pill at the right of the
  app header (AppHeaderPortal), narrower ones and simple mode at the top of the page.
  The open section lives in the URL hash (/account#reading), so a link can open a section and the browser's Back
  and Forward move between them. No element carries a section's bare id, so the browser never jump-scrolls to a
  hash.
*/

export const SETTINGS_TABS = ["account", "reading", "bible-translations", "study-tools", "release-notes"] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTINGS_TAB: SettingsTabId = "account";

export function isSettingsTab(value: string): value is SettingsTabId {
  return (SETTINGS_TABS as readonly string[]).includes(value);
}

/** "#reading" opens Reading; no hash, or one that isn't a tab, opens Account. */
export function tabFromHash(hash: string): SettingsTabId {
  const id = hash.replace(/^#/, "");
  return isSettingsTab(id) ? id : DEFAULT_SETTINGS_TAB;
}

/**
 * The tab a key moves to from `current`: Left and Right step along the row, wrapping at the ends, and Home and End
 * go to the ends. Null for any other key.
 */
export function tabForKey(key: string, current: SettingsTabId): SettingsTabId | null {
  const index = SETTINGS_TABS.indexOf(current);
  const last = SETTINGS_TABS.length - 1;
  switch (key) {
    case "ArrowRight":
      return SETTINGS_TABS[index === last ? 0 : index + 1];
    case "ArrowLeft":
      return SETTINGS_TABS[index === 0 ? last : index - 1];
    case "Home":
      return SETTINGS_TABS[0];
    case "End":
      return SETTINGS_TABS[last];
    default:
      return null;
  }
}

export const settingsTabId = (tab: SettingsTabId) => `settings-tab-${tab}`;
export const settingsPanelId = (tab: SettingsTabId) => `settings-panel-${tab}`;

// pushState fires no event, so selecting a tab tells the subscribers itself.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}

const readTab = () => tabFromHash(window.location.hash);
const serverTab = () => DEFAULT_SETTINGS_TAB;

/** The open tab, from the hash, and a way to open another as a new history entry. */
export function useSettingsTab(): [SettingsTabId, (tab: SettingsTabId) => void] {
  const tab = useSyncExternalStore(subscribe, readTab, serverTab);
  const select = useCallback((next: SettingsTabId) => {
    if (next === readTab()) return;
    window.history.pushState(null, "", `#${next}`);
    listeners.forEach((listener) => listener());
    // A new section starts at its heading even when the previous section was long.
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  return [tab, select];
}

/** The width from which the tabs sit in the app header. page.module.css uses the same width. */
export const SETTINGS_HEADER_QUERY = "(min-width: 900px)";

function subscribeToPlacement(listener: () => void) {
  const query = window.matchMedia(SETTINGS_HEADER_QUERY);
  query.addEventListener("change", listener);
  // Simple mode hides the header's page controls (.simple-hide), so turning it on brings the tabs back to the page.
  const simpleMode = new MutationObserver(listener);
  simpleMode.observe(document.documentElement, { attributes: true, attributeFilter: ["data-simple"] });
  return () => {
    query.removeEventListener("change", listener);
    simpleMode.disconnect();
  };
}

const readFitsHeader = () => window.matchMedia(SETTINGS_HEADER_QUERY).matches && !readSimpleModeFromDom();
const serverFitsHeader = () => false;

/**
 * Whether the tabs belong in the app header: a wide screen outside simple mode. False on the server and while
 * hydrating, when the page's own copy renders (and page.module.css hides it where the header copy will be).
 */
export function useSettingsTabsFitHeader(): boolean {
  return useSyncExternalStore(subscribeToPlacement, readFitsHeader, serverFitsHeader);
}
