"use client";

import { useFaithTradition } from "@/lib/useFaithTradition";
import { isLdsContentPath } from "@/lib/faithTradition";

import Link from "next/link";
import type { PropsWithChildren } from "react";
import { usePathname } from "next/navigation";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";

export default function AppMain({ children }: PropsWithChildren) {
  const { showLdsContent } = useFaithTradition();
  const pathname = usePathname();
  const { canUseInsights, isPanelOpen } = useInsightBuilder();
  // Notes starts higher, and on desktop fits its calendar and note to the window, so entries show sooner.
  const notesRoute = pathname === "/notes" || pathname.startsWith("/notes/");
  // The Notebook panel is 440px (xl 480px) wide, inset 1rem from the right edge.
  const hasDesktopInsightPanel = canUseInsights && isPanelOpen && !notesRoute;
  const resourceManagerRoute = pathname === "/resources/manage";

  return (
    <main
      data-fixed={resourceManagerRoute ? "true" : undefined}
      className={`app-main w-full px-4 pb-28 sm:px-6 sm:pb-10 lg:px-8 ${notesRoute ? "pt-3 sm:pt-4 lg:pb-4" : "pt-5 sm:pt-7"} ${
        resourceManagerRoute ? "sm:h-screen sm:overflow-hidden sm:pb-3" : ""
      } ${
        hasDesktopInsightPanel ? "lg:pr-[472px] xl:pr-[512px]" : ""
      }`}
    >
      {!showLdsContent && isLdsContentPath(pathname) ? (
        <section className="page-shell panel-card rounded-xl p-6">
          <h1 className="text-xl font-semibold">Content hidden by your faith tradition</h1>
          <p className="mt-2">You can change your faith tradition in Settings → Reading.</p>
          <div className="mt-4 flex gap-4"><Link href="/browse" className="underline">Browse the Bible</Link>
            <Link href="/account#reading" className="underline">Settings</Link></div>
        </section>
      ) : children}
    </main>
  );
}
