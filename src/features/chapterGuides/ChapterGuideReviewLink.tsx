"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function ChapterGuideReviewLink({ className, onClick }: { className: string; onClick?: () => void }) {
  const { isChapterGuideReviewer } = useAuth();
  if (!isChapterGuideReviewer) return null;
  return (
    <Link href="/resources/manage/chapter-guides" className={className} onClick={onClick}>
      Chapter guide reviews
    </Link>
  );
}
