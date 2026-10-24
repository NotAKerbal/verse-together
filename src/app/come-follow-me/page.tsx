import type { Metadata } from "next";
import Link from "next/link";
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
      <h1 className="sr-only">Come, Follow Me lessons</h1>
      <LessonOverview serverToday={serverToday} />
      <p className={styles.plansLink}>
        <Link href="/plans">Your study plans</Link>
      </p>
    </section>
  );
}
