"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faBookOpen, faBookmark, faCalendarDays, faCheck, faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import AccountManager from "@/features/auth/AccountManager";
import { useSimpleMode } from "@/lib/simpleMode";
import styles from "./page.module.css";

const destinations = [
  { href: "/notes", label: "Notes", icon: faPenToSquare },
  { href: "/plans", label: "Reading plans", icon: faCalendarDays },
  { href: "/insights/saved", label: "Saved insights", icon: faBookmark },
  { href: "/browse", label: "Scripture library", icon: faBookOpen },
];

export default function AccountPage() {
  const [simpleMode, setSimpleMode] = useSimpleMode();

  return (
    <section className={styles.shell} aria-labelledby="account-title">
      <header className={styles.header}>
        <h1 id="account-title" className="page-title">Account</h1>
        <Link href="/help" className={styles.guide}>Guide <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" /></Link>
      </header>
      <div className={styles.panel}>
        <AccountManager />
        <nav aria-label="Your study" className={styles.study}>
          <h2 className={styles.label}>Your study</h2>
          {destinations.map(({ href, label, icon }) => (
            <Link key={href} href={href} className={styles.destination}>
              <FontAwesomeIcon icon={icon} className={styles.destinationIcon} aria-hidden="true" />
              <span>{label}</span>
              <FontAwesomeIcon icon={faArrowRight} className={styles.arrow} aria-hidden="true" />
            </Link>
          ))}
        </nav>
        <div className={styles.preferences}>
          <h2 className={styles.label}>Reading</h2>
          <div className={styles.setting}>
            <div><span className={styles.settingTitle}>Simple mode</span><p aria-live="polite">{simpleMode ? "Study tools hidden" : "Study tools visible"} · This device</p></div>
            <button type="button" role="switch" aria-checked={simpleMode} aria-label="Simple mode"
              className={styles.toggle} onClick={() => setSimpleMode(!simpleMode)}>
              <span><FontAwesomeIcon icon={faCheck} aria-hidden="true" /></span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
