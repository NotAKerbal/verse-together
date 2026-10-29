import type { Metadata } from "next";
import LessonOverview from "@/features/comeFollowMe/LessonOverview";
import styles from "@/features/comeFollowMe/lessons.module.css";
import { toLocalDateKey } from "@/lib/comeFollowMe";

export const metadata: Metadata = {
  title: "Come, Follow Me · Verse Together",
  description: "This week's Come, Follow Me lesson and every earlier study guide, each paired with the scripture.",
};

export const revalidate = 3600;

export default function ComeFollowMePage() {
  const serverToday = toLocalDateKey(new Date());
  return (
    <section className={`page-shell ${styles.overview}`}>
      <h1 className="sr-only">Come, Follow Me lessons</h1>
      <LessonOverview serverToday={serverToday} />
    </section>
  );
}
