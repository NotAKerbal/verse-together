"use client";

import type { PropsWithChildren } from "react";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";

export default function AppMain({ children }: PropsWithChildren) {
  const { activeDraftId } = useInsightBuilder();
  const hasDesktopInsightPanel = Boolean(activeDraftId);

  return (
    <main
      className={`w-full px-4 py-8 ${
        hasDesktopInsightPanel ? "lg:pr-[380px] xl:pr-[440px] 2xl:pr-[500px]" : ""
      }`}
    >
      {children}
    </main>
  );
}
