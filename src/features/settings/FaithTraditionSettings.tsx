"use client";

import { useState } from "react";
import { FAITH_TRADITIONS } from "@/lib/faithTradition";
import { useFaithTradition } from "@/lib/useFaithTradition";
import styles from "@/app/account/page.module.css";

export default function FaithTraditionSettings() {
  const { tradition, setTradition } = useFaithTradition();
  const [error, setError] = useState(false);
  return <section className={`${styles.settingsCard} ${styles.faithCard}`} aria-labelledby="faith-tradition-title">
    <div className={styles.preferences}>
      <div>
        <h3 id="faith-tradition-title" className={styles.settingTitle}>Faith tradition</h3>
        <p id="faith-tradition-description" className="mt-1 text-sm text-[color:var(--foreground-muted)]">
          Choose the content you see · This device. Other denominations keeps Bible reading and your journal,
          and hides Latter-day Saint scriptures, Come Follow Me, Joseph Smith Translation and study resources.
        </p>
      </div>
      <fieldset className={styles.faithFieldset} aria-describedby="faith-tradition-description">
        <legend className="sr-only">Faith tradition</legend>
        <ul className={styles.faithChoices}>
          {FAITH_TRADITIONS.map((option) => <li key={option.id}><label
            className={styles.faithChoice}
            data-active={tradition === option.id ? "true" : "false"}>
            <input type="radio" name="faith-tradition" value={option.id} checked={tradition === option.id}
              onChange={() => setError(!setTradition(option.id))} className="accent-current" />
            <span>{option.label}</span>
          </label></li>)}
        </ul>
      </fieldset>
      {error ? <p role="alert">Your browser could not save this preference. Allow local storage and try again.</p> : null}
    </div>
  </section>;
}
