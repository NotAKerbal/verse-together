"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import AccountManager from "@/features/auth/AccountManager";
import { useSimpleMode } from "@/lib/simpleMode";
import styles from "./page.module.css";

export default function AccountPage() {
  const [simpleMode, setSimpleMode] = useSimpleMode();

  return (
    <section className={styles.shell} aria-label="Account settings">
      <h1 className="sr-only">Account settings</h1>
      <AccountManager>
        <div className={styles.preferences}>
          <div className={styles.setting}>
            <div>
              <span className={styles.settingTitle}>Simple mode</span>
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
      </AccountManager>
    </section>
  );
}
