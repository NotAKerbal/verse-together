"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import AccountManager from "@/features/auth/AccountManager";
import QuickMarkSettings from "@/features/annotations/QuickMarkSettings";
import { useSimpleMode } from "@/lib/simpleMode";
import styles from "./page.module.css";

export default function AccountPage() {
  const [simpleMode, setSimpleMode] = useSimpleMode();

  return (
    <section className={styles.shell} aria-label="Settings">
      <h1 className="sr-only">Settings</h1>
      <div className={styles.manager}>
        <section className={styles.accountSettings} aria-labelledby="account-settings-title">
          <h2 id="account-settings-title" className={styles.settingTitle}>Account settings</h2>
          <AccountManager />
        </section>
        <div className={styles.settingsColumn}>
          <section className={styles.settingsCard} aria-label="General settings">
            <div className={styles.preferences}>
              <div className={styles.setting}>
                <div>
                  <h2 className={styles.settingTitle}>Simple mode</h2>
                  <p aria-live="polite">{simpleMode ? "Study tools hidden" : "Study tools visible"} · This device</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={simpleMode}
                  aria-label="Simple mode"
                  className={styles.toggle}
                  onClick={() => setSimpleMode(!simpleMode)}
                >
                  <span><FontAwesomeIcon icon={faCheck} aria-hidden="true" /></span>
                </button>
              </div>
            </div>
          </section>
          <section className={styles.settingsCard} aria-labelledby="quick-mark-settings-title">
            <div className={styles.preferences}>
              <QuickMarkSettings />
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
