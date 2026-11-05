import Link from "next/link";
import ChapterGuideOwnerPanel from "@/features/chapterGuides/ChapterGuideOwnerPanel";
import ChapterGuideReviewQueue from "@/features/chapterGuides/ChapterGuideReviewQueue";
import { getServerViewer } from "@/lib/auth-server";

export default async function ChapterGuideOwnerPage() {
  const { viewer } = await getServerViewer();
  if (viewer?.isAdmin) {
    return (
      <main className="page-shell py-2 sm:py-4 space-y-4">
        <Link href="/resources/manage" className="surface-button inline-flex w-fit rounded-full border px-4 py-2 text-sm">
          Back to resource manager
        </Link>
        <h1 className="text-xl font-semibold">AI chapter guides</h1>
        <ChapterGuideOwnerPanel siteSecretConfigured={Boolean(process.env.CHAPTER_GUIDE_SERVICE_SECRET?.trim())} />
      </main>
    );
  }
  if (viewer?.isChapterGuideReviewer) {
    return (
      <main className="page-shell py-2 sm:py-4 space-y-4">
        <Link href="/account" className="surface-button inline-flex w-fit rounded-full border px-4 py-2 text-sm">
          Back to settings
        </Link>
        <h1 className="text-xl font-semibold">AI chapter guide reviews</h1>
        <p className="text-sm text-foreground/70">Read the drafts held for human review and choose whether to continue them.</p>
        <ChapterGuideReviewQueue audience="reviewer" />
      </main>
    );
  }
  return (
    <main className="page-shell py-2 sm:py-4">
      <p className="panel-card rounded-[1.35rem] p-4 text-sm text-foreground/70">This page is only available to admins.</p>
      <Link href="/browse" className="surface-button inline-flex w-fit rounded-full border px-4 py-2 text-sm">
        Back to browse
      </Link>
    </main>
  );
}
