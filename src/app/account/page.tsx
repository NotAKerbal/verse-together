"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookBible, faBookOpen, faClockRotateLeft, faCommentDots, faHighlighter, faUser } from "@fortawesome/free-solid-svg-icons";
import { AppHeaderPortal, useAppHeaderSlot } from "@/components/AppHeaderSlot";
import FeedbackForm from "@/components/FeedbackForm";
import AccountManager from "@/features/auth/AccountManager";
import QuickMarkSettings from "@/features/annotations/QuickMarkSettings";
import BibleTranslationControls from "@/components/BibleTranslationControls";
import ReadingSettings from "@/features/settings/ReadingSettings";
import ReleaseNotes from "@/features/settings/ReleaseNotes";
import {
  SETTINGS_TABS,
  settingsPanelId,
  settingsTabId,
  tabForKey,
  useSettingsTab,
  useSettingsTabsFitHeader,
  type SettingsTabId,
} from "@/features/settings/settingsTabs";
import styles from "./page.module.css";

const TABS: Record<SettingsTabId, { label: string; icon: IconDefinition; title: string; lead: string }> = {
  account: { label: "Account", icon: faUser, title: "Account", lead: "Your profile, sign-in methods and devices." },
  reading: {
    label: "Reading",
    icon: faBookOpen,
    title: "Reading & appearance",
    lead: "How scripture chapters look in the reader. The reader's settings menu has the same choices.",
  },
  "bible-translations": {
    label: "Translations",
    icon: faBookBible,
    title: "Bible translations",
    lead: "Choose your default Bible and manage saved translations. Saved on this device; also available in Reader settings.",
  },
  "study-tools": {
    label: "Study tools",
    icon: faHighlighter,
    title: "Study tools",
    lead: "The marks at the top of the selection menu when you choose verses.",
  },
  "release-notes": {
    label: "Release notes",
    icon: faClockRotateLeft,
    title: "Release notes",
    lead: "What has changed in Verse Together, release by release.",
  },
  feedback: {
    label: "Feedback",
    icon: faCommentDots,
    title: "Feedback",
    lead: "Ideas, problems, or requests for Verse Together. Every message is read.",
  },
};

/**
 * One tab's panel. Every panel stays mounted and the others are hidden, so unsaved edits in one (a profile
 * name, a quick mark being changed) are still there after visiting another.
 */
function SettingsPanel({ tab, selected, children }: { tab: SettingsTabId; selected: boolean; children: ReactNode }) {
  const { title, lead } = TABS[tab];
  return (
    <section
      id={settingsPanelId(tab)}
      role="tabpanel"
      aria-labelledby={settingsTabId(tab)}
      hidden={!selected}
      className={styles.panel}
    >
      <header className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <p className={styles.panelLead}>{lead}</p>
      </header>
      {children}
    </section>
  );
}

type SettingsTabsProps = {
  placement: "header" | "page";
  selected: SettingsTabId;
  onSelect: (tab: SettingsTabId) => void;
  /** Set while the tabs move between the page and the header with focus on one of them, so the new copy takes it. */
  carryFocusRef: RefObject<boolean>;
};

/** The sections' tabs: a pill, the open section dark with its name and the others as icons. */
function SettingsTabs({ placement, selected, onSelect, carryFocusRef }: SettingsTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<SettingsTabId, HTMLButtonElement>());

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const labels = Array.from(list.querySelectorAll<HTMLElement>(`.${styles.tabLabelText}`));
    const measureLabels = () => {
      labels.forEach((label) => {
        const width = `${label.getBoundingClientRect().width}px`;
        const button = label.closest("button");
        button?.style.setProperty("--settings-label-width", width);
        if (button?.getAttribute("aria-selected") === "true") {
          list.style.setProperty("--settings-active-label-width", width);
        }
      });
      list.dataset.measured = "true";
    };
    measureLabels();
    const observer = new ResizeObserver(measureLabels);
    labels.forEach((label) => observer.observe(label));
    return () => observer.disconnect();
  }, [selected, placement]);

  // Only one copy exists at a time, so moving between the page and the header remounts the tabs. The old copy
  // notes whether it had focus before it is removed, and the new one gives focus to its open tab.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (carryFocusRef.current) {
      carryFocusRef.current = false;
      list?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    }
    return () => {
      if (list?.contains(document.activeElement)) carryFocusRef.current = true;
    };
  }, [carryFocusRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = tabForKey(event.key, selected);
    if (!next) return;
    event.preventDefault();
    onSelect(next);
    // Keep keyboard focus on the newly selected tab.
    tabRefs.current.get(next)?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Settings"
      aria-orientation="horizontal"
      data-placement={placement}
      style={{ "--settings-active-index": SETTINGS_TABS.indexOf(selected) } as CSSProperties}
      className={styles.tabList}
      onKeyDown={handleKeyDown}
    >
      <span className={styles.tabIndicator} aria-hidden="true" />
      {SETTINGS_TABS.map((tab) => {
        const isSelected = tab === selected;
        return (
          <button
            key={tab}
            ref={(node) => {
              if (node) tabRefs.current.set(tab, node);
              else tabRefs.current.delete(tab);
            }}
            type="button"
            role="tab"
            id={settingsTabId(tab)}
            aria-selected={isSelected}
            aria-controls={settingsPanelId(tab)}
            tabIndex={isSelected ? 0 : -1}
            className={styles.tab}
            // The pill shows only the open section's name, so the others name themselves on hover.
            title={TABS[tab].label}
            onClick={() => onSelect(tab)}
          >
            <FontAwesomeIcon icon={TABS[tab].icon} aria-hidden="true" className={styles.tabIcon} />
            <span className={styles.tabLabel}><span className={styles.tabLabelText}>{TABS[tab].label}</span></span>
          </button>
        );
      })}
    </div>
  );
}

export default function AccountPage() {
  const [selected, select] = useSettingsTab();
  // Wide screens put the tabs at the header's right, beside the navigation; phones, tablets, simple mode (which
  // hides the header's page controls) and the server-rendered page keep them at the top of the page. One copy
  // renders at a time, so their ids and keyboard focus are never duplicated.
  const { available } = useAppHeaderSlot();
  const fitsHeader = useSettingsTabsFitHeader();
  const inHeader = available && fitsHeader;
  const carryFocusRef = useRef(false);
  const tabs = (
    <SettingsTabs
      placement={inHeader ? "header" : "page"}
      selected={selected}
      onSelect={select}
      carryFocusRef={carryFocusRef}
    />
  );

  return (
    <div className={styles.shell}>
      {/* The sections' own headings say where you are; the page title is for screen readers. */}
      <h1 className="sr-only">Settings</h1>

      {inHeader ? <AppHeaderPortal>{tabs}</AppHeaderPortal> : tabs}

      <div className={styles.panels}>
        <SettingsPanel tab="account" selected={selected === "account"}>
          <AccountManager />
        </SettingsPanel>

        <SettingsPanel tab="reading" selected={selected === "reading"}>
          <ReadingSettings />
        </SettingsPanel>

        <SettingsPanel tab="bible-translations" selected={selected === "bible-translations"}>
          <section className={`${styles.settingsCard} ${styles.translationsCard}`} aria-label="Bible translations">
            <div className={styles.preferences}>
              <BibleTranslationControls />
              <p className="text-xs leading-relaxed text-foreground/60">
                Open a Bible chapter and use Reader settings to show saved translations beside your default Bible.
              </p>
            </div>
          </section>
        </SettingsPanel>

        <SettingsPanel tab="study-tools" selected={selected === "study-tools"}>
          <section className={styles.settingsCard} aria-labelledby="quick-mark-settings-title">
            <div className={styles.preferences}>
              <QuickMarkSettings />
            </div>
          </section>
        </SettingsPanel>

        <SettingsPanel tab="release-notes" selected={selected === "release-notes"}>
          <ReleaseNotes />
        </SettingsPanel>

        <SettingsPanel tab="feedback" selected={selected === "feedback"}>
          <FeedbackForm />
        </SettingsPanel>
      </div>

      <p className={styles.policyLink}>
        <Link href="/privacy">Privacy policy</Link>
      </p>
    </div>
  );
}
