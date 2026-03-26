"use client";

import type { PropsWithChildren } from "react";
import { usePathname } from "next/navigation";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";

export default function AppMain({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { activeDraftId } = useInsightBuilder();
  const hasDesktopInsightPanel = Boolean(activeDraftId) && pathname !== "/feed" && !pathname.startsWith("/feed/");

  return (
    <main
      className={`w-full px-4 pb-28 pt-5 sm:px-6 sm:pb-10 sm:pt-7 lg:px-8 ${
        hasDesktopInsightPanel ? "lg:pr-[380px] xl:pr-[440px] 2xl:pr-[500px]" : ""
      }`}
    >
      {children}
    </main>
  );
}
