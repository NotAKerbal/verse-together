"use client";

import { useState } from "react";
import Link from "next/link";
import { SignInButton, UserButton, useClerk } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight, faArrowRightFromBracket, faBookOpen, faBookmark,
  faCalendarDays, faCheck, faPenToSquare, faUser,
} from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "@/lib/auth";
import { useSimpleMode } from "@/lib/simpleMode";
import styles from "./page.module.css";

const destinations = [
  { href: "/notes", label: "Notes", icon: faPenToSquare },
  { href: "/plans", label: "Reading plans", icon: faCalendarDays },
  { href: "/insights/saved", label: "Saved insights", icon: faBookmark },
  { href: "/browse", label: "Scripture library", icon: faBookOpen },
];

export default function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const { openUserProfile } = useClerk();
  const [simpleMode, setSimpleMode] = useSimpleMode();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await signOut({ redirectUrl: "/" });
    } catch {
      setError("Couldn’t sign out. Try again.");
      setSigningOut(false);
    }
  }

  return (
    <section className={styles.shell} aria-labelledby="account-title">
      <header className={styles.header}>
        <h1 id="account-title" className="page-title">Account</h1>
        <Link href="/help" className={styles.guide}>Guide <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" /></Link>
      </header>
      <div className={styles.panel}>
        {loading ? (
          <div className={styles.profile} role="status" aria-label="Loading account" aria-busy="true">
            <span className={styles.avatarSkeleton} aria-hidden="true" />
            <span className={styles.skeletonLines} aria-hidden="true"><span /><span /></span>
          </div>
        ) : user ? (
          <div className={styles.profile}>
            <UserButton afterSignOutUrl="/" appearance={{ elements: {
              userButtonTrigger: { width: "3rem", height: "3rem", justifyContent: "center" },
              userButtonAvatarBox: { width: "2.75rem", height: "2.75rem" },
            } }} />
            <div className={styles.identity}>
              <h2>{user.fullName || user.email || "Your account"}</h2>
              {user.fullName && user.email ? <p>{user.email}</p> : null}
            </div>
            <button type="button" className={styles.edit} aria-label="Edit profile" onClick={() => openUserProfile()}>
              <span className={styles.editLabel}>Edit profile</span>
              <FontAwesomeIcon icon={faPenToSquare} className={styles.editIcon} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className={styles.profile}>
            <span className={styles.guestAvatar}><FontAwesomeIcon icon={faUser} aria-hidden="true" /></span>
            <div className={styles.identity}><h2>Your study, together.</h2><p>Sign in to sync across devices.</p></div>
            <SignInButton mode="modal"><button type="button" className={styles.edit}>Sign in</button></SignInButton>
          </div>
        )}
        <div>
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
        {user && !loading ? (
          <footer className={styles.footer}>
            {error ? <p role="alert" className={styles.error}>{error}</p> : null}
            <button type="button" className={styles.signOut} disabled={signingOut} onClick={() => void handleSignOut()}>
              <FontAwesomeIcon icon={faArrowRightFromBracket} aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </footer>
        ) : null}
      </div>
    </section>
  );
}
