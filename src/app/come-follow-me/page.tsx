import type { Metadata } from "next";
import Link from "next/link";
import AccountControl from "@/components/AccountControl";
import LessonOverview from "@/features/comeFollowMe/LessonOverview";
import styles from "@/features/comeFollowMe/lessons.module.css";
import { toLocalDateKey } from "@/lib/comeFollowMe";

export const metadata: Metadata = {
  title: "Come, Follow Me · Verse Together",
  description: "This week's Come, Follow Me lesson and every earlier study guide, each paired with the scripture.",
};

// "This week" is settled in the reader's own time zone after hydration; hourly regeneration keeps the
// server's first render close to it.
export const revalidate = 3600;

export default function ComeFollowMePage() {
  const serverToday = toLocalDateKey(new Date());
  return (
    <section className={`page-shell ${styles.overview}`}>
      <header className={styles.intro}>
        <div className={styles.introTop}>
          <p className={styles.kicker}>
            <span>Come, Follow Me</span>
            <span>Old Testament 2026</span>
          </p>
          {/* Phones have no app header; the account sits at the page's top right, as on Notes. */}
          <AccountControl variant="page" />
        </div>
        <h1 className={styles.heading}>Weekly lessons</h1>
        <p className={styles.lede}>
          Each study guide is paired with the week&apos;s full scripture text. Start with this week, then scroll back
          through earlier lessons.
        </p>
      </header>
      <LessonOverview serverToday={serverToday} />
      <p className={styles.plansLink}>
        <Link href="/plans">Your study plans</Link>
      </p>
    </section>
  );
}
