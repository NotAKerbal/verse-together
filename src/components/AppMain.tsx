"use client";

import type { PropsWithChildren } from "react";
import { usePathname } from "next/navigation";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";

export default function AppMain({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { canUseInsights, isPanelOpen } = useInsightBuilder();
  // The Notebook panel is 440px (xl 480px) wide, inset 1rem from the right edge.
  const hasDesktopInsightPanel = canUseInsights && isPanelOpen && pathname !== "/notes" && !pathname.startsWith("/notes/");
  const resourceManagerRoute = pathname === "/resources/manage";

  return (
    <main
      data-fixed={resourceManagerRoute ? "true" : undefined}
      className={`app-main w-full px-4 pb-28 pt-5 sm:px-6 sm:pb-10 sm:pt-7 lg:px-8 ${
        resourceManagerRoute ? "sm:h-[calc(100vh-var(--header-height))] sm:overflow-hidden sm:pb-3 sm:pt-3" : ""
      } ${
        hasDesktopInsightPanel ? "lg:pr-[472px] xl:pr-[512px]" : ""
      }`}
    >
      {children}
    </main>
  );
}
